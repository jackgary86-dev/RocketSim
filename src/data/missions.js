// Mission list, objective evaluation, scoring and browser-saved progress.

export const MISSIONS = [
  { id: 'first-orbit', reward: 20, name: 'First Orbit', brief: 'Put any payload into a stable orbit with a perigee above 150 km.', rocketClass: null, goals: { orbit: true } },
  { id: 'smallsat', reward: 45, name: 'Smallsat Rideshare', brief: 'Use a Small-class launcher to reach a 500 km circular orbit.', rocketClass: 'Small', goals: { orbit: true, alt: [470, 530] } },
  { id: 'station', reward: 120, name: 'Station Resupply', brief: 'Deliver at least 3 t of cargo to a 410 km orbit inclined 51.6°.', rocketClass: null, goals: { orbit: true, alt: [390, 430], inc: [50.6, 52.6], payload: 3 } },
  { id: 'heavy-haul', reward: 250, name: 'Heavy Haul', brief: 'Carry 20 t or more into low Earth orbit.', rocketClass: null, goals: { orbit: true, payload: 20 } },
  { id: 'high-orbit', reward: 110, name: 'High Orbit', brief: 'Reach a circular orbit at 800 km or higher.', rocketClass: null, goals: { orbit: true, altMin: 800 } },
  { id: 'reusable', reward: 160, name: 'Land the Booster', brief: 'Reach orbit on a reusable vehicle and bring the first stage back to the droneship.', rocketClass: null, goals: { orbit: true, landing: true } },
  { id: 'deploy', reward: 70, name: 'Satellite Deploy', brief: 'Reach orbit, then deploy the payload as a free-flying spacecraft.', rocketClass: null, goals: { orbit: true, deploy: true } },
  { id: 'deorbit', reward: 130, name: 'Return to Earth', brief: 'Reach orbit, then deorbit the upper stage and bring it down in the Pacific.', rocketClass: null, goals: { orbit: true, deorbit: true } },
  { id: 'manual', reward: 200, name: 'Fly It Yourself', brief: 'Reach orbit on HARD difficulty — you fly pitch, heading and staging.', rocketClass: null, goals: { orbit: true, difficulty: 'hard' } },
  { id: 'moonshot', reward: 400, name: 'Moonshot Rehearsal', brief: 'Super Heavy class: 40 t or more to a 250 km parking orbit.', rocketClass: 'Super Heavy', goals: { orbit: true, payload: 40, alt: [230, 270] } },
];

const DIFF_MULT = { easy: 1, normal: 1.5, hard: 2.2 };

/** Evaluate a finished (or ongoing) flight against a mission. */
export function evaluate(mission, sim, vehicle, difficulty) {
  const el = sim.tel.el;
  const lines = [];
  const g = mission ? mission.goals : { orbit: true };
  const inOrbit = sim.status === 'orbit' || sim.flags.orbitAchieved;
  const peKm = el.periapsis / 1000, apKm = el.apoapsis / 1000;
  const add = (label, ok, text) => lines.push({ label, ok, text });

  if (g.orbit) add('Stable orbit', inOrbit, inOrbit ? `${apKm.toFixed(0)} × ${peKm.toFixed(0)} km` : sim.status);
  if (g.alt) { const ok = inOrbit && peKm >= g.alt[0] && apKm <= g.alt[1]; add(`Orbit ${g.alt[0]}–${g.alt[1]} km`, ok, `${apKm.toFixed(0)} × ${peKm.toFixed(0)} km`); }
  if (g.altMin) add(`Orbit ≥ ${g.altMin} km`, inOrbit && peKm >= g.altMin, `perigee ${peKm.toFixed(0)} km`);
  if (g.inc) add(`Inclination ${g.inc[0]}–${g.inc[1]}°`, inOrbit && el.inc >= g.inc[0] && el.inc <= g.inc[1], `${el.inc.toFixed(1)}°`);
  if (g.payload) add(`Payload ≥ ${g.payload} t`, vehicle.payload >= g.payload, `${vehicle.payload.toFixed(1)} t`);
  if (g.landing) add('Booster landed', !!sim.flags.boosterLanded, sim.flags.boosterLanded ? 'on the droneship' : 'not recovered');
  if (g.deploy) add('Payload deployed', !!sim.flags.deployed, sim.flags.deployed ? 'free flying' : 'still attached');
  if (g.deorbit) add('Upper stage deorbited', !!sim.flags.reentered, sim.flags.reentered ? 'reentry complete' : 'still in orbit');
  if (g.difficulty) add(`Difficulty: ${g.difficulty}`, difficulty === g.difficulty, difficulty);
  if (mission?.rocketClass) add(`${mission.rocketClass}-class vehicle`, vehicle.class === mission.rocketClass, vehicle.class);

  const success = lines.every((l) => l.ok);
  let score = 0;
  if (inOrbit) {
    score += 1000;
    const target = vehicle.targetAlt / 1000;
    const err = Math.abs(peKm - target) + Math.abs(apKm - target);
    score += Math.max(0, 500 - err * 2);
    score += Math.min(500, vehicle.payload * 10);
  } else {
    score += Math.min(400, sim.stats.maxAlt / 1000);
  }
  if (sim.flags.boosterLanded) score += 400;
  if (sim.flags.deployed) score += 200;
  if (sim.flags.reentered) score += 300;
  if (success && mission) score += 1000;
  score = Math.round(score * (DIFF_MULT[difficulty] || 1));
  return { success, score, lines };
}

const KEY = 'rocketsim.progress.v1';
export const progress = {
  data: { completed: {}, best: {}, flights: 0 },
  load() {
    try { const raw = localStorage.getItem(KEY); if (raw) this.data = { ...this.data, ...JSON.parse(raw) }; } catch { /* storage unavailable */ }
    return this.data;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ } },
  record(missionId, result, rocketId) {
    this.data.flights++;
    const key = missionId || 'free';
    if (result.success && missionId) this.data.completed[missionId] = { rocket: rocketId, score: result.score, at: Date.now() };
    if (!this.data.best[key] || this.data.best[key] < result.score) this.data.best[key] = result.score;
    this.save();
  },
};

const SKEY = 'rocketsim.settings.v1';
export const settings = {
  data: { difficulty: 'easy', failures: true, sound: true, voice: true, units: 'imperial' },
  load() { try { const raw = localStorage.getItem(SKEY); if (raw) this.data = { ...this.data, ...JSON.parse(raw) }; } catch { /* ignore */ } return this.data; },
  save() { try { localStorage.setItem(SKEY, JSON.stringify(this.data)); } catch { /* ignore */ } },
};
