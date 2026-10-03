import { PROPELLANTS, grossMass } from '../data/config.js';
import { clamp } from './math.js';

const ORIGINS = {
  SpaceX: 'Hawthorne, CA', ULA: 'Decatur, AL', NASA: 'Michoud, LA', 'Rocket Lab': 'Auckland, NZ',
  'Avio / ESA': 'Colleferro, Italy', ISRO: 'Bengaluru, India', 'Progress RSC': 'Samara, Russia',
  'MHI / JAXA': 'Nagoya, Japan', Arianespace: 'Les Mureaux, France', ArianeGroup: 'Bremen, Germany',
  CALT: 'Tianjin, China', Khrunichev: 'Moscow, Russia', 'Blue Origin': 'Huntsville, AL',
};

const fmtT = (t) => (t >= 100 ? `${t.toFixed(0)} t` : t >= 1 ? `${t.toFixed(1)} t` : `${(t * 1000).toFixed(0)} kg`);

/**
 * Builds the shipping manifest shown after the build phase: every stage, engine set,
 * booster, fairing, payload and propellant lot, each with a transport mode and a
 * scheduled arrival inside a 15–60 s window that scales with vehicle size.
 */
export function buildManifest(vehicle) {
  const glow = grossMass(vehicle);
  const duration = clamp(5 + 12.5 * Math.log10(glow), 15, 60);
  const items = [];
  const origin = ORIGINS[vehicle.maker] || 'Assembly plant';

  const transportFor = (mass, long) => (mass > 150 || long > 40 ? 'barge' : mass > 40 || long > 25 ? 'rail' : mass > 8 ? 'heavy truck' : 'truck');

  vehicle.stages.forEach((s, i) => {
    const len = (vehicle.height * (s.prop / vehicle.stages.reduce((a, x) => a + x.prop, 0))) * 0.8;
    const sections = s.dry > 60 ? ['Forward tank section', 'Aft tank section', 'Thrust structure & interstage'] : s.dry > 15 ? ['Tank section', 'Thrust structure & interstage'] : [`${s.name} structure`];
    sections.forEach((sec, k) => items.push({ key: `stage:${i}`, kind: 'stage', icon: '🚀', title: `${s.name} — ${sec}`, sub: `${(s.d || vehicle.diameter).toFixed(1)} m dia · ${(len / sections.length).toFixed(0)} m · ${fmtT(s.dry * 0.75 / sections.length)}`, mass: s.dry * 0.75 / sections.length, transport: transportFor(s.dry / sections.length, len / sections.length), origin, part: k, parts: sections.length }));
    if (s.fuel !== 'solid') {
      const batches = Math.max(1, Math.ceil(s.engines / 6));
      for (let b = 0; b < batches; b++) {
        const n = Math.min(6, s.engines - b * 6);
        items.push({ key: `engine:${i}`, kind: 'engine', icon: '🔥', title: `${n}× engine${n > 1 ? 's' : ''} — ${s.name}${batches > 1 ? ` (lot ${b + 1}/${batches})` : ''}`, sub: `${(s.thrust / s.engines * n).toFixed(0)} kN · Isp ${s.ispVac.toFixed(0)} s vac`, mass: s.dry * 0.25 * n / s.engines, transport: s.dry * 0.25 * n / s.engines > 8 ? 'heavy truck' : 'aircraft', origin: 'Engine plant', part: b, parts: batches });
      }
    } else {
      items.push({ key: `engine:${i}`, kind: 'engine', icon: '🧨', title: `${s.name} solid motor segments`, sub: `${fmtT(s.prop)} cast propellant · ${(s.thrust).toFixed(0)} kN`, mass: s.prop + s.dry * 0.25, transport: 'rail', origin: 'Motor casting plant', hazmat: true });
    }
  });
  vehicle.boosters.forEach((b, j) => {
    const each = b.dry + (b.fuel === 'solid' ? b.prop : 0);
    for (let k = 0; k < b.count; k++) {
      items.push({ key: `booster:${j}:${k}`, kind: 'booster', icon: b.fuel === 'solid' ? '🧨' : '🚀', title: `${b.name} #${k + 1}`, sub: `${b.d.toFixed(1)} m × ${b.len.toFixed(0)} m · ${fmtT(each)}`, mass: each, transport: transportFor(each, b.len), origin: b.extra ? 'Motor casting plant' : origin, hazmat: b.fuel === 'solid' });
    }
  });
  const noseName = { fairing: 'Payload fairing halves', capsule: 'Crew capsule & escape tower', ship: 'Nose section & flaps', shuttle: 'Orbiter' }[vehicle.nose];
  items.push({ key: 'nose', kind: 'nose', icon: vehicle.nose === 'capsule' ? '🛸' : '🛡️', title: noseName, sub: `${vehicle.diameter.toFixed(1)} m`, mass: 0.085 * vehicle.diameter ** 2, transport: 'aircraft', origin: 'Integration facility' });
  items.push({ key: 'payload', kind: 'payload', icon: '🛰️', title: `Payload — ${fmtT(vehicle.payload)}`, sub: 'Encapsulated in clean-room container', mass: vehicle.payload, transport: 'aircraft', origin: 'Customer' });
  items.push({ kind: 'gse', icon: '🔧', title: 'Ground support equipment', sub: 'Umbilicals, hold-down posts, swing arms', mass: 25, transport: 'truck', origin: 'Pad warehouse' });

  // propellant lots
  const lots = {};
  const addLot = (prop, mass, cryo) => { lots[prop] = lots[prop] || { prop, mass: 0, cryo }; lots[prop].mass += mass; };
  const all = [...vehicle.stages, ...vehicle.boosters.map((b) => ({ ...b, prop: b.prop * b.count }))];
  for (const s of all) {
    if (s.fuel === 'solid') continue;
    const P = PROPELLANTS[s.fuel];
    const f = s.prop / (1 + P.of);
    addLot(P.fuel, f, P.fuelCryo);
    addLot(P.ox, s.prop - f, P.oxCryo);
  }
  for (const L of Object.values(lots)) {
    const perTruck = L.prop === 'LH2' ? 3.5 : L.prop === 'LCH4' ? 14 : 20;
    const total = L.mass * 1.05;
    const convoys = Math.min(8, Math.max(1, Math.ceil(total / 250)));
    for (let c = 0; c < convoys; c++) {
      const m = total / convoys;
      const trucks = Math.max(1, Math.ceil(m / perTruck));
      items.push({ kind: 'prop', icon: L.cryo ? '🧊' : '🛢️', title: `${L.prop} — ${fmtT(m)}${convoys > 1 ? ` (convoy ${c + 1}/${convoys})` : ''}`, sub: `${trucks} tanker${trucks > 1 ? 's' : ''} · includes 5% boil-off/reserve`, mass: m, transport: 'tanker convoy', origin: L.cryo ? 'Air separation plant' : 'Refinery', hazmat: true, trucks });
    }
  }
  addLot('Helium (pressurant)', glow * 0.0008, false);
  items.push({ kind: 'prop', icon: '🎈', title: `Helium pressurant — ${fmtT(glow * 0.0008)}`, sub: 'Tube trailers', mass: glow * 0.0008, transport: 'tube trailer', origin: 'Gas supplier' });

  // schedule arrivals across the window, hardware first then propellants
  const n = items.length;
  items.forEach((it, i) => { it.at = (0.03 + 0.92 * (i / Math.max(1, n - 1))) * duration; it.arrived = false; });
  const totalMass = items.reduce((m, it) => m + it.mass, 0);
  return { items, duration, totalMass, glow };
}

export class DeliverySequence {
  constructor(vehicle) {
    Object.assign(this, buildManifest(vehicle));
    this.t = 0;
    this.done = false;
    this.current = null;
    this.delivered = 0;
  }
  update(dt) {
    if (this.done) return;
    this.t += dt;
    for (const it of this.items) {
      if (!it.arrived && this.t >= it.at) { it.arrived = true; this.current = it; this.delivered += it.mass; }
    }
    if (this.t >= this.duration) this.done = true;
  }
  skip() { for (const it of this.items) it.arrived = true; this.delivered = this.totalMass; this.t = this.duration; this.done = true; }
}
