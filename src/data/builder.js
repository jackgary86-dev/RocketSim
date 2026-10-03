// Rocket builder: assemble a custom vehicle from catalogue parts and persist it.
// A saved design is a small spec (part ids, not copies) so catalogue tweaks carry over.
import { ROCKETS } from './rockets.js';
import { buildVehicle, DEFAULT_CONFIG, vehicleStats, PROPELLANTS } from './config.js';
import { FlightSim } from '../sim/flight.js';

export const LIVERIES = [
  { id: 'white', name: 'White', body: '#f2f2f0', accent: '#1e1e1e' },
  { id: 'orange', name: 'Orange', body: '#d0762f', accent: '#f4f4f4' },
  { id: 'steel', name: 'Steel', body: '#b9bec4', accent: '#2b2e33' },
  { id: 'black', name: 'Black', body: '#1b1d22', accent: '#e6e6e6' },
  { id: 'blue', name: 'Blue', body: '#e8ecf4', accent: '#1d3c78' },
];
export const NOSES = [['fairing', 'Payload fairing'], ['capsule', 'Capsule + escape tower']];

const isStandard = (r) => r.nose !== 'shuttle';
const sources = () => ROCKETS.filter(isStandard);

/** Catalogue parts: lower stages (stage 1 of any rocket), uppers (last stage) and booster sets. */
export function parts() {
  const lower = [], upper = [], boosters = [];
  for (const r of sources()) {
    const first = r.stages[0];
    lower.push({ id: r.id, label: `${r.name} — ${first.name}`, rocket: r, stage: first });
    if (r.stages.length > 1) {
      const last = r.stages[r.stages.length - 1];
      upper.push({ id: r.id, label: `${r.name} — ${last.name}`, rocket: r, stage: last });
    }
    if (r.boosters) boosters.push({ id: r.id, label: `${r.name} — ${r.boosters.name} ×${r.boosters.count}`, rocket: r, booster: r.boosters });
  }
  return { lower, upper, boosters };
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const find = (list, id) => list.find((p) => p.id === id);

function stageLen(s, d) {
  const vol = (s.prop * 1000) / PROPELLANTS[s.fuel].bulk + s.dry * 0.3;
  return (vol / (Math.PI * (d / 2) ** 2)) * 1.15 + 0.5 * d;
}

/** Turn a spec into a rocket object shaped like a ROCKETS entry. Payload is sized separately. */
export function rocketFromSpec(spec, payload = spec.payload ?? 1) {
  const P = parts();
  const lo = find(P.lower, spec.lower), up = find(P.upper, spec.upper);
  if (!lo || !up) return null;
  const bo = spec.boosters ? find(P.boosters, spec.boosters.id) : null;
  const D = lo.stage.d || lo.rocket.diameter;
  const first = clone(lo.stage); delete first.d;
  const second = clone(up.stage);
  const ud = Math.min(up.stage.d || up.rocket.diameter, D);
  if (ud < D - 0.05) second.d = +ud.toFixed(2); else delete second.d;
  delete second.reusable; // only the stage-1 booster has landing hardware
  const lens = [stageLen(first, D), stageLen(second, ud)];
  const nose = spec.nose === 'capsule' ? 'capsule' : 'fairing';
  const noseLen = nose === 'fairing' ? 2.4 * D : 2.2 * D;
  const lv = LIVERIES.find((l) => l.id === spec.livery) || LIVERIES[0];
  const rocket = {
    id: spec.id, name: spec.name, maker: 'Custom build', country: 'Builder', era: 'Custom',
    class: 'Custom', custom: true, height: +(lens[0] + lens[1] + noseLen).toFixed(1), diameter: D,
    payload: +payload.toFixed(2), nose, colors: { body: lv.body, accent: lv.accent },
    gridFins: !!(first.reusable && lo.rocket.gridFins),
    desc: `Custom stack: ${lo.label}, ${up.label}${bo ? `, ${spec.boosters.count}× ${bo.booster.name}` : ''}.`,
    stages: [first, second],
  };
  if (bo) {
    const b = clone(bo.booster);
    b.count = spec.boosters.count;
    b.len = +Math.min(b.len, Math.max(8, lens[0])).toFixed(1);
    rocket.boosters = b;
  }
  return rocket;
}

/** Largest payload (t) that keeps ~450 m/s of ideal Δv margin and liftoff T/W >= 1.15, or 0 if none. */
export function sizePayload(spec) {
  const ok = (p) => {
    const r = rocketFromSpec(spec, p);
    if (!r) return false;
    const st = vehicleStats(buildVehicle(r, DEFAULT_CONFIG));
    return st.margin >= 450 && st.twr >= 1.15;
  };
  if (!ok(0.05)) return 0;
  let lo = 0.05, hi = 200;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

/** Headless ascent to confirm a design reaches orbit at its default config. */
export function reachesOrbit(rocket) {
  const sim = new FlightSim(buildVehicle(rocket, DEFAULT_CONFIG));
  let n = 0;
  while (sim.t < 4000 && sim.status === 'ascent' && n++ < 400000) sim.step(0.05);
  return sim.status === 'orbit';
}

/** Size the payload, then shave it until the full ascent sim reaches orbit. Returns payload t or 0. */
export function certifyPayload(spec) {
  let p = sizePayload(spec);
  for (let i = 0; i < 8 && p > 0.05; i++) {
    if (reachesOrbit(rocketFromSpec(spec, p))) return +p.toFixed(2);
    p *= 0.85;
  }
  return 0;
}

export function previewStats(spec) {
  const payload = sizePayload(spec);
  const r = rocketFromSpec(spec, payload || 0.05);
  if (!r) return null;
  const v = buildVehicle(r, DEFAULT_CONFIG);
  return { rocket: r, vehicle: v, stats: vehicleStats(v), payload };
}

const KEY = 'rocketsim.custom.v1';
export const customStore = {
  specs: [],
  load() {
    try { const raw = localStorage.getItem(KEY); if (raw) this.specs = JSON.parse(raw); } catch { /* storage unavailable */ }
    if (!Array.isArray(this.specs)) this.specs = [];
    return this.specs;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.specs)); } catch { /* ignore */ } },
  add(spec) {
    spec.id = `custom-${Date.now().toString(36)}`;
    this.specs.push(spec); this.save();
    return spec.id;
  },
  remove(id) { this.specs = this.specs.filter((s) => s.id !== id); this.save(); },
};

/** Catalogue followed by the player's saved designs. */
export function allRockets() {
  const custom = [];
  for (const s of customStore.specs) {
    const r = rocketFromSpec(s);
    if (r) custom.push(r);
  }
  return [...ROCKETS, ...custom];
}
