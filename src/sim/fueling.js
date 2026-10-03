import { PROPELLANTS, grossMass } from '../data/config.js';
import { clamp, lerp } from './math.js';

const smooth = (t) => t * t * (3 - 2 * t);
const win = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

/**
 * Hands-on propellant loading. The operator opens vents, starts each tank's load,
 * pressurises and arms. Fill times scale with vehicle size so a prompt operator
 * finishes in roughly 60 s (small) to 120 s (super heavy).
 */
export class FuelingSequence {
  constructor(vehicle, { failures = false, rng = Math.random } = {}) {
    this.v = vehicle;
    const glow = grossMass(vehicle);
    this.duration = clamp(52 + 17 * Math.log10(glow), 60, 120);
    this.t = 0;
    this.phase = 'idle';     // idle | purge | load | press | arm | done
    this.phaseT = 0;
    this.holding = false;
    this.holdLeft = 0;
    this.holdResolved = false;
    this.done = false;
    this.log = [];
    this.newLog = [];
    this.tanks = [];
    this.actions = [];

    const groups = vehicle.stages.map((s, i) => ({ s, label: s.name, idx: i }));
    vehicle.boosters.forEach((b, j) => groups.push({ s: b, label: `${b.name} ×${b.count}`, idx: 10 + j, count: b.count }));
    let id = 0;
    for (const g of groups) {
      const P = PROPELLANTS[g.s.fuel];
      const total = g.s.prop * (g.count || 1);
      if (g.s.fuel === 'solid') {
        this.tanks.push({ id: id++, group: g.label, name: 'Solid grain', prop: 'APCP', kind: 'solid', cap: total, level: 1, temp: 293, press: 1.0, status: 'CAST — SAFE', fixed: true, armed: false });
        continue;
      }
      const fuelMass = total / (1 + P.of);
      const oxMass = total - fuelMass;
      if (g.s.fuel === 'hypergolic') {
        this.tanks.push({ id: id++, group: g.label, name: 'Fuel', prop: P.fuel, kind: 'fuel', cap: fuelMass, level: 1, temp: 293, press: 1.6, status: 'LOADED (T-3 d)', fixed: true });
        this.tanks.push({ id: id++, group: g.label, name: 'Oxidiser', prop: P.ox, kind: 'ox', cap: oxMass, level: 1, temp: 293, press: 1.6, status: 'LOADED (T-3 d)', fixed: true });
        continue;
      }
      const fillTime = this.duration * 0.5;
      this.tanks.push({ id: id++, group: g.label, name: 'Fuel', prop: P.fuel, kind: 'fuel', cap: fuelMass, level: 0, temp: 293, press: 1.0, status: 'EMPTY', cryo: P.fuelCryo, propTemp: P.fuelTemp, fillTime: fillTime * (P.fuelCryo ? 1 : 0.8), started: null, vent: 0 });
      this.tanks.push({ id: id++, group: g.label, name: 'Oxidiser', prop: P.ox, kind: 'ox', cap: oxMass, level: 0, temp: 293, press: 1.0, status: 'EMPTY', cryo: P.oxCryo, propTemp: P.oxTemp, fillTime, started: null, vent: 0 });
    }

    this.anomaly = null;
    if (failures && rng() < 0.55) {
      const issues = [
        ['PROPULSION', 'LOX replenish valve slow to respond', 'Valve cycled — responding nominally'],
        ['GROUND SYSTEMS', 'Ground cryogenic storage pressure out of limits', 'Pressure recovered after relief valve reseat'],
        ['RANGE', 'Boat detected in the downrange hazard area', 'Range cleared — vessel escorted out'],
        ['INSTRUMENTATION', 'Tank level sensor dropout on stage 1', 'Switched to redundant sensor'],
        ['WEATHER', 'Lightning detected within 10 nautical miles', 'Lightning rule cleared'],
      ];
      const [who, text, fix] = issues[Math.floor(rng() * issues.length)];
      this.anomaly = { trigger: 0.25 + rng() * 0.45, who, text, fix, len: 6 + rng() * 6, fired: false };
    }
    this.emit('LAUNCH DIRECTOR', 'Pad is clear. Propellant loading is under operator control — open vents to begin.');
  }

  emit(who, text, kind = 'info') {
    const e = { t: this.t, who, text, kind };
    this.log.push(e);
    this.newLog.push(e);
  }

  get liquidTanks() { return this.tanks.filter((k) => !k.fixed); }
  get allLoaded() { return this.liquidTanks.every((k) => k.level > 0.995); }
  get loadedMass() { return this.tanks.reduce((m, k) => m + k.cap * k.level, 0); }
  get totalMass() { return this.tanks.reduce((m, k) => m + k.cap, 0); }
  get ventLevel() { return this.tanks.reduce((m, k) => Math.max(m, k.vent || 0), 0); }
  get progress() {
    const steps = { idle: 0, purge: 0.08, load: 0.1 + 0.6 * (this.loadedMass / Math.max(1, this.totalMass)), press: 0.8, arm: 0.92, done: 1 };
    return steps[this.phase];
  }

  // ---------- operator actions ----------
  openVents() {
    if (this.phase !== 'idle') return;
    this.phase = 'purge'; this.phaseT = 0;
    this.emit('GROUND SYSTEMS', 'Tank vent valves open — GN2 purge of transfer lines in progress');
  }
  startTank(id) {
    const k = this.tanks.find((x) => x.id === id);
    if (!k || k.fixed || k.started !== null || this.phase !== 'load' || this.holding) return;
    k.started = this.t;
    this.emit('PROPULSION', `${k.prop} load started — ${k.group} ${k.name.toLowerCase()} tank${k.cryo ? ' (chilldown first)' : ''}`);
  }
  startAll() { for (const k of this.liquidTanks) this.startTank(k.id); }
  pressurize() {
    if (this.phase !== 'load' || !this.allLoaded || this.holding) return;
    this.phase = 'press'; this.phaseT = 0;
    this.emit('PROPULSION', 'Tanks at flight level. Pressurising to flight pressure with helium');
  }
  arm() {
    if (this.phase !== 'arm') return;
    for (const k of this.tanks) if (k.kind === 'solid') { k.armed = true; k.status = 'ARMED'; }
    this.phase = 'done'; this.done = true;
    const solids = this.tanks.some((k) => k.kind === 'solid');
    this.emit('PROPULSION', `${solids ? 'Safe & arm devices to ARM. ' : ''}Vehicle propellant system is flight ready`, 'good');
    this.emit('LAUNCH DIRECTOR', 'Propellant load complete. Proceed to safety & pre-launch checks', 'good');
  }
  resumeHold() {
    if (!this.holding || !this.holdResolved) return;
    this.holding = false; this.holdResolved = false;
    this.emit('LAUNCH DIRECTOR', 'Hold released — resuming propellant operations', 'good');
  }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    this.phaseT += dt;
    if (this.holding) {
      this.holdLeft -= dt;
      if (this.holdLeft <= 0 && !this.holdResolved) {
        this.holdResolved = true;
        this.emit(this.anomaly.who, `${this.anomaly.fix}. Standing by for operator to resume`, 'good');
      }
      for (const k of this.liquidTanks) if (k.started !== null) k.started += dt; // freeze fills
      return;
    }
    if (this.phase === 'purge' && this.phaseT > 4) {
      this.phase = 'load'; this.phaseT = 0;
      this.emit('PROPULSION', 'Purge complete. Transfer lines ready — start tank loads (fills may run in parallel)');
    }
    if (this.phase === 'load') {
      const frac = this.loadedMass / Math.max(1, this.totalMass);
      if (this.anomaly && !this.anomaly.fired && frac > this.anomaly.trigger) {
        this.anomaly.fired = true; this.holding = true; this.holdLeft = this.anomaly.len; this.holdResolved = false;
        this.emit(this.anomaly.who, `HOLD HOLD HOLD — ${this.anomaly.text}`, 'bad');
      }
      for (const k of this.liquidTanks) {
        if (k.started === null) { k.status = 'READY'; continue; }
        const f = (this.t - k.started) / k.fillTime;
        if (k.cryo) {
          const chill = win(f, 0, 0.14), fast = win(f, 0.14, 0.85), top = win(f, 0.85, 1);
          k.temp = lerp(293, k.propTemp, smooth(chill));
          k.level = 0.92 * smooth(fast) + 0.08 * top;
          k.status = f < 0.14 ? 'CHILLDOWN' : f < 0.85 ? 'FAST FILL' : f < 1 ? 'TOPPING' : 'REPLENISH';
          k.vent = f > 0.05 ? 0.4 + 0.6 * k.level : 0;
        } else {
          k.level = smooth(win(f, 0, 1));
          k.temp = lerp(293, k.propTemp, k.level);
          k.status = f < 1 ? 'FILLING' : 'LOADED';
        }
        if (f >= 1) k.level = 0.998 + 0.002 * Math.sin(this.t * 0.9 + k.id);
        k.press = 1.15 + 0.15 * k.level;
        if (!k.loggedFull && f >= 1) { k.loggedFull = true; this.emit('PROPULSION', `${k.group} ${k.prop} tank at flight level`); }
      }
    }
    if (this.phase === 'press') {
      const f = win(this.phaseT, 0, 6);
      for (const k of this.tanks) {
        if (k.kind === 'solid') continue;
        const flightP = k.kind === 'fuel' ? 2.6 : 3.4;
        k.press = lerp(k.fixed ? 1.6 : 1.3, flightP, smooth(f));
        k.status = f < 1 ? 'PRESSURISING' : 'FLIGHT PRESSURE';
        if (k.vent) k.vent = lerp(k.vent, 0.08, 0.02);
      }
      if (f >= 1) {
        this.phase = 'arm'; this.phaseT = 0;
        this.emit('PROPULSION', 'Flight pressure verified on all tanks. Awaiting ARM command');
      }
    }
  }
}
