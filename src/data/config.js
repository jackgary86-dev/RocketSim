import { G0 } from '../sim/math.js';

// Propellant combinations. isp: representative [sea level, vacuum] used to scale a
// stage's Isp when the player swaps its propellant. bulk: mixed bulk density (kg/m^3).
export const PROPELLANTS = {
  kerolox: {
    name: 'Kerolox', fuel: 'RP-1', ox: 'LOX', of: 2.56, bulk: 1030, isp: [282, 320],
    fuelTemp: 266, oxTemp: 90, fuelCryo: false, oxCryo: true,
    plume: 0xffa040, plumeCore: 0xfff0b0, smoke: 0.55,
    blurb: 'Dense and simple. High thrust, modest efficiency, sooty orange plume.',
  },
  hydrolox: {
    name: 'Hydrolox', fuel: 'LH2', ox: 'LOX', of: 6.0, bulk: 360, isp: [366, 450],
    fuelTemp: 20, oxTemp: 90, fuelCryo: true, oxCryo: true,
    plume: 0x9cc8ff, plumeCore: 0xe8f2ff, smoke: 0.12,
    blurb: 'Highest Isp of any chemical rocket. Huge, heavy tanks and a nearly invisible plume.',
  },
  methalox: {
    name: 'Methalox', fuel: 'LCH4', ox: 'LOX', of: 3.6, bulk: 830, isp: [327, 365],
    fuelTemp: 111, oxTemp: 90, fuelCryo: true, oxCryo: true,
    plume: 0x8a8cff, plumeCore: 0xe0e4ff, smoke: 0.2,
    blurb: 'Clean-burning, reusable-friendly. Good balance of density and efficiency.',
  },
  hypergolic: {
    name: 'Hypergolic', fuel: 'UDMH', ox: 'N2O4', of: 2.2, bulk: 1150, isp: [285, 320],
    fuelTemp: 293, oxTemp: 293, fuelCryo: false, oxCryo: false,
    plume: 0xff7a50, plumeCore: 0xffd0a0, smoke: 0.35,
    blurb: 'Storable at room temperature and ignites on contact. Toxic to handle.',
  },
  solid: {
    name: 'Solid (APCP)', fuel: 'APCP', ox: null, of: 0, bulk: 1750, isp: [250, 280],
    fuelTemp: 293, oxTemp: 293, fuelCryo: false, oxCryo: false,
    plume: 0xffe3a0, plumeCore: 0xffffff, smoke: 1.0,
    blurb: 'Cast propellant grain. Enormous thrust, cannot be throttled or shut down.',
  },
};

export const LIQUIDS = ['kerolox', 'hydrolox', 'methalox', 'hypergolic'];

export const DEFAULT_CONFIG = {
  fuel: 'stock',          // 'stock' or a liquid propellant key applied to all liquid stages
  tankStretch: 0,         // % extra propellant
  extraBoosters: 0,       // count of strap-on solid motors added
  engineUprate: 0,        // % extra thrust
  vacNozzle: false,       // +4% vacuum Isp on upper stages
  composites: false,      // -10% dry mass
  controlFins: 'aero',    // 'none' | 'aero' | 'grid'
  payloadPct: 100,        // % of the vehicle's default payload
  targetAlt: 250,         // km
  azimuth: 90,            // launch azimuth, degrees from north
};

export const UPGRADE_INFO = {
  tankStretch: 'Lengthen every tank. More propellant, more structure, lower liftoff thrust-to-weight.',
  extraBoosters: 'Strap on additional solid rocket motors. Big liftoff kick, dropped after ~90 s.',
  engineUprate: 'Run the engines at higher chamber pressure for extra thrust.',
  vacNozzle: 'Fit large vacuum-optimised nozzle extensions to the upper stages.',
  composites: 'Carbon-composite tanks and interstages shave dry mass.',
  controlFins: 'Aerodynamic control surfaces. Grid fins give the most authority in the lower atmosphere.',
  payloadPct: 'A lighter payload leaves more Δv for a higher or longer trajectory.',
  targetAlt: 'Circular orbit altitude the autopilot aims for.',
  azimuth: 'Launch heading. 90° (due east) gains the most from Earth\'s rotation.',
};

const clone = (o) => JSON.parse(JSON.stringify(o));

function retarget(stage, newFuel, cfg, isUpper) {
  const s = { ...stage };
  if (newFuel && s.fuel !== 'solid' && newFuel !== s.fuel) {
    const from = PROPELLANTS[s.fuel], to = PROPELLANTS[newFuel];
    s.ispSL = Math.round(s.ispSL * (to.isp[0] / from.isp[0]));
    s.ispVac = Math.round(s.ispVac * (to.isp[1] / from.isp[1]));
    // ~60% of dry mass is tankage, which scales with propellant volume
    s.dry = s.dry * (0.4 + 0.6 * (from.bulk / to.bulk));
    s.fuel = newFuel;
  }
  const stretch = cfg.tankStretch / 100;
  s.prop *= 1 + stretch;
  s.dry *= 1 + stretch * 0.5;
  s.thrust *= 1 + cfg.engineUprate / 100;
  s.dry *= 1 + cfg.engineUprate / 400;
  if (cfg.vacNozzle && isUpper && s.fuel !== 'solid') {
    s.ispVac *= 1.04;
    s.dry *= 1.03;
  }
  if (cfg.composites) s.dry *= 0.9;
  return s;
}

/** Apply the player's configuration to a base rocket, returning a flight-ready vehicle. */
export function buildVehicle(rocket, cfg = DEFAULT_CONFIG) {
  const base = clone(rocket);
  const fuel = cfg.fuel === 'stock' ? null : cfg.fuel;
  const v = {
    ...base,
    config: { ...cfg },
    payload: base.payload * (cfg.payloadPct / 100),
    stages: base.stages.map((s, i) => retarget(s, fuel, cfg, i > 0)),
    boosters: [],
  };
  if (base.boosters) v.boosters.push(retarget(base.boosters, fuel, cfg, false));

  if (cfg.extraBoosters > 0) {
    const glow = grossMass(v);
    const prop = Math.max(0.8, glow * 0.05);
    v.boosters.push({
      name: 'Strap-on SRM', count: cfg.extraBoosters, fuel: 'solid', extra: true,
      dry: prop * 0.14, prop, thrust: (prop * 1000 * 275 * G0) / 88 / 1000,
      ispSL: 250, ispVac: 275,
      d: Math.max(0.5, base.diameter * 0.32), len: base.height * 0.36, color: '#efefef',
    });
  }
  const finMass = { none: 0, aero: 0.004, grid: 0.006 }[cfg.controlFins] || 0;
  v.stages[0].dry *= 1 + finMass;
  v.targetAlt = cfg.targetAlt * 1000;
  v.azimuth = cfg.azimuth;
  return v;
}

export function grossMass(v) {
  let m = v.payload;
  for (const s of v.stages) m += s.dry + s.prop;
  for (const b of v.boosters || []) m += (b.dry + b.prop) * b.count;
  return m;
}

/** Idealised vacuum Δv (no gravity/drag), liftoff TWR and orbit margin. */
export function vehicleStats(v) {
  const glow = grossMass(v);
  let liftThrust = 0;
  for (const b of v.boosters) liftThrust += (b.thrust * b.ispSL) / b.ispVac * b.count;
  liftThrust += (v.stages[0].thrust * v.stages[0].ispSL) / v.stages[0].ispVac;
  const twr = liftThrust / (glow * G0);

  // integrate the rocket equation with parallel booster burns
  const boost = v.boosters.map((b) => ({ ...b, left: b.prop * b.count * 1000 }));
  let m = glow * 1000;
  let dv = 0;
  const stageDv = [];
  for (let i = 0; i < v.stages.length; i++) {
    const s = v.stages[i];
    let left = s.prop * 1000;
    let sdv = 0;
    const dt = 0.25;
    let guard = 0;
    const mdotS = (s.thrust * 1000) / (s.ispVac * G0);
    while (left > 0 && guard++ < 400000) {
      let T = s.thrust * 1000, mdot = mdotS;
      if (i === 0) {
        for (const b of boost) {
          if (b.dropped) continue;
          const md = (b.thrust * 1000 * b.count) / (b.ispVac * G0);
          T += b.thrust * 1000 * b.count; mdot += md;
          b.left -= md * dt;
          if (b.left <= 0) { b.dropped = true; m -= b.dry * b.count * 1000; }
        }
      }
      sdv += (T / m) * dt;
      m -= mdot * dt;
      left -= mdotS * dt;
    }
    if (i === 0) for (const b of boost) if (!b.dropped) { b.dropped = true; m -= b.left + b.dry * b.count * 1000; }
    m -= s.dry * 1000;
    stageDv.push(sdv);
    dv += sdv;
  }
  const needed = 9300 + 0.55 * (v.targetAlt / 1000 - 200);
  return { glow, twr, dv, stageDv, needed, margin: dv - needed, liftThrust };
}
