import {
  G0, MU, RE, OMEGA, DEG, clamp, lerp, add, sub, scale, dot, cross, len, norm,
  latLonToUnit, inertialToLatLon, localFrame, surfaceVelocity, atmosphere,
  dragCoefficient, orbitalElements,
} from './math.js';
import { PROPELLANTS } from '../data/config.js';

// sea: side of the pad (pad-local) that the ocean lies on, or null for an inland site.
export const LAUNCH_SITES = [
  { id: 'cape', name: 'Launch Complex 39A — Cape Canaveral', short: 'LC-39A', place: 'the Cape', lat: 28.6084, lon: -80.6043, sea: 'east', azRange: [35, 120], azDefault: 90 },
  { id: 'vandenberg', name: 'Space Launch Complex 4E — Vandenberg', short: 'SLC-4E', place: 'Vandenberg', lat: 34.632, lon: -120.611, sea: 'west', azRange: [140, 200], azDefault: 180 },
  { id: 'kourou', name: 'ELA-4 — Guiana Space Centre, Kourou', short: 'ELA-4', place: 'Kourou', lat: 5.239, lon: -52.768, sea: 'east', azRange: [10, 100], azDefault: 90 },
  { id: 'baikonur', name: 'Site 31 — Baikonur Cosmodrome', short: 'Site 31', place: 'Baikonur', lat: 45.996, lon: 63.564, sea: null, azRange: [35, 100], azDefault: 62 },
];
export const LAUNCH_SITE = LAUNCH_SITES[0];
export const getSite = (id) => LAUNCH_SITES.find((s) => s.id === id) || LAUNCH_SITE;

const QALPHA_WARN = 150000;  // Pa·deg
const QALPHA_LIMIT = 260000; // Pa·deg — structural limit in the dense atmosphere

/**
 * Point-mass 3-DOF ascent simulator in an Earth-centred inertial frame with a
 * rotating spherical Earth, standard atmosphere, Mach-dependent drag, pressure-
 * dependent Isp, parallel booster burns, staging, autopilot and manual control.
 */
export class FlightSim {
  constructor(vehicle, { site = LAUNCH_SITE, t0 = -3, failures = false, rng = Math.random } = {}) {
    this.v = vehicle;
    this.site = site;
    this.t = t0;
    this.rng = rng;
    this.attMode = 'guidance';   // guidance | prograde | retrograde
    this.engineOut = 1;          // thrust factor after an engine-out failure
    this.payloadDeployed = false;
    this.failure = null;
    if (failures && rng() < 0.45) {
      const s0 = vehicle.stages[0];
      const boosterT = vehicle.boosters.reduce((t, b) => t + b.thrust * b.count * b.ispSL / b.ispVac, 0);
      const liftT = boosterT + s0.thrust * s0.ispSL / s0.ispVac * (s0.engines - 1) / s0.engines;
      const glow = vehicle.payload + vehicle.stages.reduce((m, x) => m + x.dry + x.prop, 0) + vehicle.boosters.reduce((m, b) => m + (b.dry + b.prop) * b.count, 0);
      if (s0.engines >= 3 && s0.fuel !== 'solid' && liftT / (glow * G0) > 1.08) {
        this.failure = { type: 'engine-out', at: 25 + rng() * 60, fired: false };
      } else {
        this.failure = { type: 'guidance-drift', at: 40 + rng() * 60, fired: false, len: 25 };
      }
    }
    this.padUnit = latLonToUnit(site.lat, site.lon);
    this.r = scale(this.padUnit, RE);
    this.vel = surfaceVelocity(this.r);

    this.stage = 0;
    this.stageProp = vehicle.stages.map((s) => s.prop * 1000);
    this.boosters = vehicle.boosters.map((b) => ({ ...b, left: b.prop * b.count * 1000, attached: true, burnedOut: false }));
    this.stageState = 'burn';   // burn | burnout | coast | done
    this.stageTimer = 0;
    this.engineLit = true;
    this.throttleCmd = 1;
    this.throttle = 1;

    const D = vehicle.diameter;
    this.fairingMass = vehicle.nose === 'fairing' ? 0.085 * D * D * 1000
      : vehicle.nose === 'capsule' ? vehicle.payload * 0.12 * 1000 : 0;
    this.fairingOn = this.fairingMass > 0;

    this.autopilot = true;
    this.autoStage = true;
    this.input = { pitch: 0, yaw: 0 };
    this.offPitch = 0;
    this.offYaw = 0;
    this.attPitch = 90;
    this.attHeading = vehicle.azimuth;
    this.manualBase = null;

    this.liftedOff = false;
    this.status = 'ascent';     // ascent | orbit | suborbital | crashed | breakup
    this.events = [];
    this.newEvents = [];
    this.separations = [];      // consumed by the renderer
    this.debris = [];
    this.track = [];
    this.lastTrackT = -10;
    this.flags = {};
    this.stats = { maxQ: 0, maxQt: 0, maxG: 0, maxAlt: 0, maxSpeed: 0, maxQAlpha: 0, dvUsed: 0 };
    this.tel = {};
    this.computeTelemetry(0, 0, 0, 0);
  }

  log(text, kind = 'info') {
    const e = { t: this.t, text, kind };
    this.events.push(e);
    this.newEvents.push(e);
  }

  get stageDef() { return this.v.stages[this.stage]; }
  get isFinalStage() { return this.stage === this.v.stages.length - 1; }

  mass() {
    let m = (this.payloadDeployed ? 0 : this.v.payload * 1000) + (this.fairingOn ? this.fairingMass : 0);
    for (let i = this.stage; i < this.v.stages.length; i++) {
      m += this.v.stages[i].dry * 1000 + this.stageProp[i];
    }
    for (const b of this.boosters) if (b.attached) m += b.dry * b.count * 1000 + Math.max(0, b.left);
    return m;
  }

  /** Cross-section area for drag (m^2). */
  area() {
    const s = this.v.stages[this.stage];
    const d = s.d || this.v.diameter;
    let A = Math.PI * d * d / 4;
    if (this.stage === 0 && s.pods) A += s.pods.count * Math.PI * s.pods.d ** 2 / 4;
    for (const b of this.boosters) if (b.attached) A += b.count * Math.PI * b.d * b.d / 4;
    return A;
  }

  controlAuthority(q) {
    const engine = this.engineLit && this.stageState === 'burn' ? 5 : 0;
    const finType = this.v.config?.controlFins ?? 'aero';
    const finGain = finType === 'grid' ? 5 : finType === 'aero' ? 3 : 0;
    const fins = this.stage === 0 && q > 200 ? Math.min(1, q / 15000) * finGain : 0;
    return engine + fins + 1.0; // +1 deg/s from reaction control
  }

  // ---------------- player controls ----------------
  separate() {
    // Booster pairs go first if still attached, then the current core stage.
    const attached = this.boosters.find((b) => b.attached);
    if (attached) { this.dropBoosters(attached, !attached.burnedOut); return; }
    if (this.isFinalStage) { this.log('No further stages to separate', 'warn'); return; }
    if (this.stageState === 'burn' && this.stageProp[this.stage] > 0) {
      this.log(`Manual separation — ${this.stageDef.name} jettisoned with propellant remaining`, 'warn');
    }
    this.doStageSep();
  }

  setAutopilot(on) {
    this.autopilot = on;
    if (!on) this.manualBase = { pitch: this.attPitch, heading: this.attHeading };
    this.offPitch = 0; this.offYaw = 0;
    this.log(on ? 'Autopilot engaged — guidance resumes pitch program' : 'Autopilot disengaged — manual attitude control', 'info');
  }

  cutEngines() {
    const s = this.stageDef;
    if (s.fuel === 'solid') { this.log('Solid motors cannot be shut down', 'warn'); return; }
    if (this.engineLit) { this.engineLit = false; this.log(`Manual engine cutoff — ${s.name}`, 'warn'); }
  }

  igniteEngines() {
    if (this.stageDef.fuel === 'solid') { this.log('Solid motors cannot be relit', 'warn'); return; }
    if (!this.engineLit && this.stageProp[this.stage] > 0 && this.stageState === 'burn') {
      this.engineLit = true; this.log(`${this.stageDef.name} relight`, 'good');
    }
  }

  // ---------------- staging ----------------
  dropBoosters(b, early) {
    b.attached = false;
    this.log(`${b.name} ×${b.count} separation${early ? ' (early — propellant remaining)' : ''}`, 'stage');
    this.spawnDebris(`${b.name} ×${b.count}`, (b.dry * b.count * 1000) + Math.max(0, b.left), b.count * Math.PI * b.d * b.d / 4, 'booster', this.boosters.indexOf(b));
  }

  doStageSep() {
    const s = this.stageDef;
    this.spawnDebris(s.name, s.dry * 1000 + this.stageProp[this.stage], Math.PI * (s.d || this.v.diameter) ** 2 / 4, 'stage', this.stage);
    this.log(`Stage separation — ${s.name} jettisoned`, 'stage');
    // any boosters still attached go with the first stage
    for (const b of this.boosters) if (b.attached) { b.attached = false; }
    this.stage++;
    this.stageState = 'coast';
    this.stageTimer = 0;
    this.engineLit = false;
  }

  spawnDebris(name, mass, area, kind, index) {
    const up = norm(this.r);
    const dir = this.thrustDir || up;
    const dv = kind === 'stage' ? -3 : 0;
    const reusable = (kind === 'stage' && index === 0 && this.v.stages[0].reusable) || (kind === 'booster' && this.boosters[index]?.reusable);
    const d = {
      name, kind, index, mass, area: Math.max(area, 0.5),
      r: [...this.r], v: add(this.vel, scale(dir, dv)),
      alive: true, impact: null, t0: this.t, reusable: !!reusable, phase: reusable ? 'coast' : null,
    };
    if (reusable) this.log(`${name} flip manoeuvre — targeting droneship landing downrange`, 'info');
    this.debris.push(d);
    this.separations.push(d);
  }

  // ---------------- guidance ----------------
  guidance(tel, aThrust) {
    const target = this.v.targetAlt;
    const alt = tel.alt;
    let pitch, heading;
    const clearAlt = this.v.height * 1.5 + 150;
    if (alt < clearAlt || tel.speedRel < 55) {
      pitch = 90;
    } else {
      // open-loop gravity turn for the dense lower atmosphere
      const prog = 90 - 58 * Math.pow(clamp((alt - clearAlt) / 60000, 0, 1), 0.62);
      // closed-loop insertion: find the radial acceleration profile (linear in time)
      // that brings the vehicle level at the target altitude exactly when it
      // reaches circular speed there, then add gravity minus centripetal relief
      const r = RE + alt;
      const vCirc = Math.sqrt(MU / (RE + target));
      const tgo = clamp(this.timeToGo(Math.max(0, vCirc - tel.vh)), 15, 1200);
      const dh = target - alt;
      const aCmd = (6 * dh - 4 * tel.vr * tgo) / (tgo * tgo);
      const gNet = MU / (r * r) - (tel.vh * tel.vh) / r;
      // steer with the mean acceleration over the remaining burn: high-thrust lower
      // stages loft more, leaving low-thrust upper stages a flatter, efficient burn
      const aAvg = Math.max((vCirc - tel.vh) / tgo, 0.1);
      const aRef = this.stage === 0 && alt < 70000 ? aThrust : Math.min(aThrust, aAvg * 1.0);
      const closed = Math.asin(clamp((aCmd + gNet) / Math.max(aRef, 0.1), -0.5, 0.9)) / DEG;
      const w = this.stage > 0 ? 1 : clamp((alt - 40000) / 30000, 0, 1);
      pitch = lerp(prog, closed, w);
      // in the dense atmosphere stay close to the airflow (gravity turn) to bound q·alpha
      if (tel.q > 1500) {
        const maxAoa = clamp(50000 / tel.q, 0.8, 12);
        pitch = clamp(pitch, tel.fpaRel - maxAoa, tel.fpaRel + maxAoa);
      }
    }
    // hold the azimuth low down, then follow the inertial velocity plane
    const wH = clamp((alt - 15000) / 25000, 0, 1);
    heading = this.v.azimuth;
    if (wH > 0 && tel.vh > 50) {
      let dh = tel.velHeading - heading;
      dh = ((dh + 540) % 360) - 180;
      heading += dh * wH;
    }
    return { pitch, heading };
  }

  /** Burn time needed to deliver dv using the current and remaining stages (vacuum). */
  timeToGo(dv) {
    let m = this.mass();
    let t = 0;
    for (let i = this.stage; i < this.v.stages.length && dv > 0; i++) {
      const s = this.v.stages[i];
      const ve = s.ispVac * G0;
      const mdot = (s.thrust * 1000) / ve;
      let prop = Math.max(0, this.stageProp[i]);
      if (i === this.stage) {
        // boosters still attached ride along as dead mass for this estimate
      }
      const avail = ve * Math.log(m / (m - prop));
      if (avail >= dv) {
        const used = m * (1 - Math.exp(-dv / ve));
        return t + used / mdot;
      }
      dv -= avail;
      t += prop / mdot + (i > this.stage ? 5 : 0);
      m -= prop + s.dry * 1000;
      if (i === this.stage) for (const b of this.boosters) if (b.attached) m -= b.dry * b.count * 1000 + Math.max(0, b.left);
    }
    return t + dv / 5; // not enough Δv: keep tgo long
  }

  // ---------------- physics ----------------
  forces(r, vel, dt, commit) {
    const rm = len(r);
    const alt = rm - RE;
    const atm = atmosphere(alt);
    const pr = atm.p / 101325;
    const m = this.mass();
    let T = 0, mdotTotal = 0;

    // boosters (always full thrust, cannot be throttled)
    for (const b of this.boosters) {
      if (!b.attached || b.left <= 0 || this.stage !== 0 || this.t < 0) continue;
      const isp = b.ispVac - (b.ispVac - b.ispSL) * pr;
      const mdot = (b.thrust * 1000 * b.count) / (b.ispVac * G0);
      T += mdot * isp * G0;
      mdotTotal += mdot;
      if (commit) b.left -= mdot * dt;
    }

    const s = this.stageDef;
    let coreT = 0;
    if (this.stageState === 'burn' && this.engineLit && this.stageProp[this.stage] > 0) {
      const isp = s.ispVac - (s.ispVac - s.ispSL) * pr;
      const mdotMax = (s.thrust * 1000) / (s.ispVac * G0);
      let thr = s.fuel === 'solid' ? 1 : this.throttleCmd;
      if (this.t < 0) thr = s.fuel === 'solid' ? 0 : thr * clamp((this.t + 3) / 2.2, 0, 1);
      if (this.stage === 0) thr *= this.engineOut;
      const anyBooster = this.boosters.some((b) => b.attached && b.left > 0);
      if (this.v.coreThrottle && anyBooster && this.t > this.v.coreThrottle.after) thr = Math.min(thr, this.v.coreThrottle.value);
      if (this.v.gLimit && s.fuel !== 'solid') {
        const maxT = this.v.gLimit * G0 * m - T;
        thr = Math.min(thr, Math.max(0.65, maxT / (mdotMax * isp * G0)));
      }
      if (s.fuel !== 'solid') thr = clamp(thr, 0, 1);
      this.throttle = thr;
      coreT = mdotMax * thr * isp * G0;
      T += coreT;
      mdotTotal += mdotMax * thr;
      if (commit) this.stageProp[this.stage] -= mdotMax * thr * dt;
    } else if (commit) {
      this.throttle = 0;
    }

    // drag
    const vRel = sub(vel, surfaceVelocity(r));
    const speedRel = len(vRel);
    const mach = speedRel / atm.a;
    const q = 0.5 * atm.rho * speedRel * speedRel;
    const Fd = q * dragCoefficient(mach) * this.area();

    const grav = scale(r, -MU / (rm * rm * rm));
    const dir = this.thrustDir;
    let acc = add(grav, scale(dir, T / m));
    if (speedRel > 0.1) acc = add(acc, scale(vRel, -Fd / m / speedRel));

    if (commit) {
      this._last = { T, m, q, mach, atm, speedRel, vRel, accThrust: T / m, Fd, mdotTotal, coreT };
    }
    return acc;
  }

  computeTelemetry() {
    const r = this.r, vel = this.vel;
    const rm = len(r);
    const alt = rm - RE;
    const { up, east, north } = localFrame(r);
    const vr = dot(vel, up);
    const vhVec = sub(vel, scale(up, vr));
    const vh = len(vhVec);
    const velHeading = (Math.atan2(dot(vhVec, east), dot(vhVec, north)) / DEG + 360) % 360;
    const vRel = sub(vel, surfaceVelocity(r));
    const speedRel = len(vRel);
    const vrRel = dot(vRel, up);
    const vhRelVec = sub(vRel, scale(up, vrRel));
    const fpaRel = Math.atan2(vrRel, len(vhRelVec)) / DEG;
    const hdgRel = (Math.atan2(dot(vhRelVec, east), dot(vhRelVec, north)) / DEG + 360) % 360;
    const atm = atmosphere(alt);
    const earthAngle = OMEGA * this.t;
    const ll = inertialToLatLon(r, earthAngle);
    const padNow = rotY(this.padUnit, earthAngle);
    const downrange = RE * Math.acos(clamp(dot(padNow, norm(r)), -1, 1));
    const el = orbitalElements(r, vel);
    const L = this._last || {};
    const flightPath = Math.atan2(vr, vh) / DEG;
    // angle of attack between vehicle axis and airflow
    let aoa = 0;
    if (this.thrustDir && speedRel > 20) aoa = Math.acos(clamp(dot(this.thrustDir, norm(vRel)), -1, 1)) / DEG;
    this.tel = {
      t: this.t, alt, vr, vh, velHeading, speed: len(vel), speedRel,
      mach: speedRel / atm.a, q: 0.5 * atm.rho * speedRel * speedRel, pressure: atm.p,
      lat: ll.lat, lon: ll.lon, downrange, el, flightPath, aoa, fpaRel, hdgRel,
      mass: this.mass(), thrust: L.T || 0, accel: (L.accThrust || 0), throttle: this.throttle,
      pitch: this.attPitch, heading: this.attHeading, heat: 0.5 * atm.rho * speedRel ** 3,
    };
    return this.tel;
  }

  attitudeVector(pitch, heading, r) {
    const { up, east, north } = localFrame(r);
    const p = pitch * DEG, h = heading * DEG;
    const horiz = add(scale(north, Math.cos(h)), scale(east, Math.sin(h)));
    return norm(add(scale(horiz, Math.cos(p)), scale(up, Math.sin(p))));
  }

  /** Advance the simulation by dt seconds of mission time. */
  step(dt) {
    if (this.status === 'crashed' || this.status === 'breakup') return;
    const tel = this.tel;
    const q = tel.q || 0;

    // --- attitude: autopilot + manual inputs, slewed at the available control authority
    const auth = this.controlAuthority(q);
    const aThrustEst = (this._last?.accThrust) || 10;
    this.offPitch = clamp(this.offPitch + this.input.pitch * auth * dt, -90, 90);
    this.offYaw = clamp(this.offYaw + this.input.yaw * auth * dt, -120, 120);
    let desP, desH;
    if (this.attMode !== 'guidance' && tel.speed > 100) {
      const sign = this.attMode === 'prograde' ? 1 : -1;
      desP = sign * tel.flightPath + this.offPitch;
      desH = (sign > 0 ? tel.velHeading : tel.velHeading + 180) + this.offYaw;
    } else if (this.autopilot) {
      const g = this.guidance(tel, aThrustEst);
      desP = g.pitch + this.offPitch;
      desH = g.heading + this.offYaw;
    } else {
      desP = this.manualBase.pitch + this.offPitch;
      desH = this.manualBase.heading + this.offYaw;
    }
    desP = clamp(desP, -90, 90);
    const rate = Math.max(auth, 1.5) * dt;
    this.attPitch += clamp(desP - this.attPitch, -rate, rate);
    let dH = ((desH - this.attHeading + 540) % 360) - 180;
    this.attHeading = (this.attHeading + clamp(dH, -rate * 1.5, rate * 1.5) + 360) % 360;
    this.thrustDir = this.attitudeVector(this.attPitch, this.attHeading, this.r);

    // --- integrate (kick-drift-kick leapfrog)
    const a0 = this.forces(this.r, this.vel, dt, true);
    const L = this._last;
    if (!this.liftedOff) {
      if (this.t >= 0 && dot(a0, norm(this.r)) > 0.05) {
        this.liftedOff = true;
        this.log('LIFTOFF', 'good');
      } else {
        // held on the pad: co-rotate with the Earth
        this.t += dt;
        this.r = scale(rotY(this.padUnit, OMEGA * this.t), RE);
        this.vel = surfaceVelocity(this.r);
        this.computeTelemetry();
        return;
      }
    }
    const vHalf = add(this.vel, scale(a0, dt / 2));
    this.r = add(this.r, scale(vHalf, dt));
    const a1 = this.forces(this.r, vHalf, dt, false);
    this.vel = add(vHalf, scale(a1, dt / 2));
    this.t += dt;
    this.stats.dvUsed += (L.accThrust || 0) * dt;

    this.updateFailure();
    this.updateDebris(dt);
    this.updateStaging(dt);
    const t2 = this.computeTelemetry();
    this.checkMilestones(t2, L);

    if (this.t - this.lastTrackT >= 2) {
      this.lastTrackT = this.t;
      this.track.push({ t: this.t, lat: t2.lat, lon: t2.lon, alt: t2.alt, speed: t2.speed });
      if (this.track.length > 40000) this.track.splice(0, 10000);
    }
  }

  updateFailure() {
    const f = this.failure;
    if (!f || !this.liftedOff) return;
    if (!f.fired && this.t >= f.at && this.stage === 0) {
      f.fired = true;
      if (f.type === 'engine-out') {
        const n = this.v.stages[0].engines;
        this.engineOut = (n - 1) / n;
        this.log(`ANOMALY: engine ${1 + Math.floor(this.rng() * n)} shutdown detected — ${n - 1} engines nominal, burn extended`, 'bad');
      } else {
        f.endAt = this.t + f.len;
        this.log('ANOMALY: inertial platform drift — guidance heading error. Correct with yaw if flying manually', 'bad');
      }
    }
    if (f.fired && f.type === 'guidance-drift' && f.endAt) {
      if (this.t < f.endAt) this.offYaw += 0.12 * (f.endAt - this.t > f.len / 2 ? 1 : -1) * 0.02;
      else { f.endAt = null; this.log('Guidance platform realigned — heading error cleared', 'good'); }
    }
  }

  // ---------------- orbit operations ----------------
  setAttMode(mode) {
    if (mode === this.attMode) return;
    this.attMode = mode;
    this.offPitch = 0; this.offYaw = 0;
    if (mode !== 'guidance') { this.autopilot = false; }
    else this.manualBase = { pitch: this.attPitch, heading: this.attHeading };
    this.log(`Attitude hold: ${mode.toUpperCase()}`, 'info');
  }

  setThrottle(v) { this.throttleCmd = clamp(v, 0.4, 1); }

  deployPayload() {
    if (this.payloadDeployed) return;
    if (!(this.status === 'orbit' || this.flags.orbitAchieved)) { this.log('Payload deploy inhibited — not in orbit', 'warn'); return; }
    if (this.fairingOn) { this.log('Payload deploy inhibited — fairing still attached', 'warn'); return; }
    this.payloadDeployed = true;
    this.flags.deployed = true;
    const vhat = norm(this.vel);
    const d = { name: 'Payload', kind: 'payload', index: -2, mass: this.v.payload * 1000, area: 2, r: [...this.r], v: add(this.vel, scale(vhat, 0.6)), alive: true, impact: null, t0: this.t, orbiting: true };
    this.debris.push(d);
    this.separations.push(d);
    this.log(`PAYLOAD DEPLOYED — ${this.v.payload.toFixed(1)} t spacecraft free flying`, 'good');
  }

  updateStaging(dt) {
    // boosters
    for (const b of this.boosters) {
      if (b.attached && !b.burnedOut && b.left <= 0) {
        b.burnedOut = true;
        b.left = 0;
        b.burnoutT = this.t;
        this.log(`${b.name} burnout`, 'info');
      }
      if (b.attached && b.burnedOut && this.autoStage && this.t - b.burnoutT > 0.8) this.dropBoosters(b, false);
    }
    const s = this.stageDef;
    if (this.stageState === 'burn' && this.stageProp[this.stage] <= 0) {
      this.stageProp[this.stage] = 0;
      this.stageState = 'burnout';
      this.stageTimer = 0;
      this.engineLit = false;
      const label = this.isFinalStage ? `${s.name} cutoff — propellant depleted` : `${s.name} engine cutoff (${this.stage === 0 ? 'MECO' : 'SECO-' + this.stage})`;
      this.log(label, this.isFinalStage ? 'warn' : 'info');
    }
    if (this.stageState === 'burnout') {
      this.stageTimer += dt;
      if (this.isFinalStage) this.stageState = 'done';
      else if (this.autoStage && this.stageTimer > 2.5) this.doStageSep();
    } else if (this.stageState === 'coast') {
      this.stageTimer += dt;
      if (this.stageTimer > 2.5) {
        this.stageState = 'burn';
        this.engineLit = true;
        this.log(`${this.stageDef.name} ignition`, 'good');
      }
    }
  }

  checkMilestones(tel, L) {
    const f = this.flags, st = this.stats;
    if (!f.tower && tel.alt > this.v.height * 1.3) { f.tower = true; this.log('Tower cleared', 'info'); }
    if (!f.pitch && tel.alt > this.v.height * 1.5 + 150 && tel.speedRel > 55) { f.pitch = true; this.log('Roll and pitch program initiated', 'info'); }
    if (!f.mach1 && tel.mach >= 1 && tel.alt < 60000) { f.mach1 = true; this.log('Vehicle is supersonic — Mach 1', 'info'); }
    if (tel.q > st.maxQ) { st.maxQ = tel.q; st.maxQt = this.t; }
    if (!f.maxq && st.maxQ > 5000 && tel.q < st.maxQ * 0.93) { f.maxq = true; this.log(`Max-Q — ${(st.maxQ / 1000).toFixed(1)} kPa`, 'good'); }
    if (this.fairingOn && tel.alt > 110000 && tel.q < 800) {
      this.fairingOn = false;
      const what = this.v.nose === 'capsule' ? 'Launch escape tower jettisoned' : 'Payload fairing separation';
      this.log(what, 'stage');
      this.spawnDebris(this.v.nose === 'capsule' ? 'Escape tower' : 'Fairing halves', this.fairingMass, 4, 'fairing', -1);
    }
    const g = (L.accThrust || 0) / G0;
    st.maxG = Math.max(st.maxG, g);
    st.maxAlt = Math.max(st.maxAlt, tel.alt);
    st.maxSpeed = Math.max(st.maxSpeed, tel.speed);

    // aerodynamic loads
    if (tel.alt < 80000 && tel.q > 3000) {
      const qa = tel.q * tel.aoa;
      st.maxQAlpha = Math.max(st.maxQAlpha, qa);
      if (qa > QALPHA_WARN && !f.qaWarn) { f.qaWarn = true; this.log('WARNING: high aerodynamic load — reduce angle of attack', 'bad'); }
      if (qa < QALPHA_WARN * 0.8) f.qaWarn = false;
      if (qa > QALPHA_LIMIT && this.status === 'ascent') {
        this.status = 'breakup';
        this.log('Vehicle structural failure — aerodynamic loads exceeded', 'bad');
        return;
      }
    }

    // orbit / end states
    const el = tel.el;
    const minPe = Math.min(this.v.targetAlt * 0.85, 150000);
    const insertion = el.periapsis > this.v.targetAlt - 12000 || (el.periapsis > 140000 && el.apoapsis > this.v.targetAlt + 150000);
    if (this.status === 'ascent' && tel.alt > 100000 && (this.autopilot ? insertion : el.periapsis > minPe)) {
      if (this.autopilot && this.engineLit && this.stageDef.fuel !== 'solid') {
        this.engineLit = false;
        this.log(`${this.stageDef.name} cutoff — guidance target reached`, 'good');
      }
      if (!this.engineLit || this.stageDef.fuel === 'solid' || !this.autopilot) {
        this.status = 'orbit';
        this.flags.orbitAchieved = true;
        this.autopilot = false;
        this.manualBase = { pitch: this.attPitch, heading: this.attHeading };
        this.log(`ORBIT ACHIEVED — ${(el.apoapsis / 1000).toFixed(0)} × ${(el.periapsis / 1000).toFixed(0)} km, ${el.inc.toFixed(1)}°`, 'good');
        this.log('Orbit operations: 1 prograde · 2 retrograde · R relight · X cutoff · P deploy payload', 'info');
      }
    }
    if (this.status === 'orbit' && tel.alt < 100000 && tel.vr < 0) {
      this.status = 'reentry';
      this.log('ENTRY INTERFACE — 100 km. Aerodynamic heating beginning', 'warn');
    }
    if (this.status === 'reentry') {
      this.stats.maxHeat = Math.max(this.stats.maxHeat || 0, tel.q * tel.speedRel);
      if (!f.plasma && tel.q > 2000 && tel.speedRel > 4000) { f.plasma = true; this.log('Plasma blackout — telemetry degraded', 'warn'); }
      if (f.plasma && !f.plasmaOut && tel.speedRel < 2500) { f.plasmaOut = true; this.log('Blackout over — tracking reacquired', 'good'); }
    }
    if (this.status === 'ascent' && this.stageState === 'done' && el.periapsis < minPe && !f.subLog) {
      f.subLog = true;
      this.status = 'suborbital';
      this.log(`Insufficient Δv for orbit — suborbital trajectory, apogee ${(el.apoapsis / 1000).toFixed(0)} km`, 'bad');
    }
    if (this.liftedOff && tel.alt < -5) {
      this.r = scale(norm(this.r), RE);
      if (this.status === 'reentry') {
        this.status = 'landed';
        this.flags.reentered = true;
        this.log(`SPLASHDOWN — ${tel.lat.toFixed(2)}°, ${tel.lon.toFixed(2)}° after ${(tel.downrange / 1000).toFixed(0)} km`, 'good');
      } else {
        this.status = 'crashed';
        this.log(`Vehicle impact — ${tel.lat.toFixed(2)}°, ${tel.lon.toFixed(2)}°, ${(tel.downrange / 1000).toFixed(0)} km downrange`, 'bad');
      }
    }
  }

  updateDebris(dt) {
    for (const d of this.debris) {
      if (!d.alive) continue;
      const rm = len(d.r);
      const alt = rm - RE;
      const atm = atmosphere(alt);
      let a = scale(d.r, -MU / (rm ** 3));
      const vRel = sub(d.v, surfaceVelocity(d.r));
      const sp = len(vRel);
      if (sp > 0.1 && atm.rho > 0) {
        const Fd = 0.5 * atm.rho * sp * sp * 1.0 * d.area;
        a = add(a, scale(vRel, -Fd / d.mass / sp));
      }
      if (d.reusable) {
        // reusable booster: entry burn then a propulsive landing burn to a soft touchdown
        const vr = dot(d.v, scale(d.r, 1 / rm));
        if (vr < 0 && alt < 75000 && d.phase === 'coast') { d.phase = 'entry'; this.log(`${d.name} entry burn`, 'info'); }
        if (d.phase === 'entry' && alt < 8000 && (sp * sp) / (2 * 22) > alt - 150) { d.phase = 'landing'; this.log(`${d.name} landing burn`, 'info'); }
        if (d.phase === 'entry' || d.phase === 'landing') {
          if (d.phase === 'landing') {
            // follow a constant-deceleration profile to touchdown (feed-forward + tracking)
            const vDes = Math.max(2, Math.sqrt(2 * 20 * Math.max(alt, 0)));
            const aCmd = clamp(20 + G0 + 1.5 * (sp - vDes), 0, 3.5 * G0);
            a = add(a, scale(vRel, -aCmd / Math.max(sp, 1)));
          } else {
            const vDes = 350 + 0.03 * alt;
            if (sp > vDes) a = add(a, scale(vRel, -Math.min(3.5 * G0, (sp - vDes) / 2 + G0) / sp));
          }
        }
      }
      d.v = add(d.v, scale(a, dt));
      d.r = add(d.r, scale(d.v, dt));
      if (alt < 0 && !d.orbiting) {
        d.alive = false;
        d.r = scale(d.r, RE / rm);
        const ll = inertialToLatLon(d.r, OMEGA * this.t);
        d.impact = { lat: ll.lat, lon: ll.lon, t: this.t, landed: d.reusable && sp < 12 };
        if (d.reusable) {
          if (sp < 12) { this.flags.boosterLanded = true; this.log(`${d.name} has landed on the droneship — ${ll.lat.toFixed(2)}°, ${ll.lon.toFixed(2)}°`, 'good'); }
          else this.log(`${d.name} lost — hard impact at ${sp.toFixed(0)} m/s`, 'bad');
        } else {
          this.log(`${d.name} splashdown at ${ll.lat.toFixed(2)}°, ${ll.lon.toFixed(2)}°`, 'info');
        }
      }
    }
  }

  /** Advance by a real-time slice at a time-warp factor, adaptively sub-stepping. */
  advance(realDt, warp) {
    let remaining = Math.min(realDt, 0.1) * warp;
    let guard = 0;
    while (remaining > 1e-6 && guard++ < 6000) {
      const powered = (this.engineLit && this.stageState === 'burn') || this.boosters.some((b) => b.attached && b.left > 0);
      const lowAlt = this.tel.alt < 140000;
      const anyDebris = this.debris.some((d) => d.alive && len(d.r) - RE < 140000);
      const h = powered || lowAlt || anyDebris || this.stageState === 'coast' || this.stageState === 'burnout' ? 0.02 : 0.5;
      const dt = Math.min(h, remaining);
      this.step(dt);
      remaining -= dt;
      if (this.status === 'crashed' || this.status === 'breakup') break;
    }
  }

  /** Two-body + Earth-rotation forward prediction of the ground track. */
  predict(seconds = 6000, step = 15) {
    let r = [...this.r], v = [...this.vel];
    const pts = [];
    let t = this.t;
    for (let i = 0; i < seconds / step; i++) {
      // RK2 midpoint (good enough for a display track)
      const rm = len(r);
      const a = scale(r, -MU / rm ** 3);
      const rMid = add(r, scale(v, step / 2));
      const vMid = add(v, scale(a, step / 2));
      const aMid = scale(rMid, -MU / len(rMid) ** 3);
      r = add(r, scale(vMid, step));
      v = add(v, scale(aMid, step));
      t += step;
      const ll = inertialToLatLon(r, OMEGA * t);
      const alt = len(r) - RE;
      pts.push({ lat: ll.lat, lon: ll.lon, alt });
      if (alt < 0) { pts.impact = ll; break; }
    }
    return pts;
  }

  stageInfo() {
    return this.v.stages.map((s, i) => ({
      name: s.name, fuel: s.fuel,
      frac: Math.max(0, this.stageProp[i]) / (s.prop * 1000),
      state: i < this.stage ? 'sep' : i === this.stage ? this.stageState : 'wait',
    }));
  }

  boosterInfo() {
    return this.boosters.map((b) => ({ name: b.name, count: b.count, frac: Math.max(0, b.left) / (b.prop * b.count * 1000), attached: b.attached }));
  }

  plumeColor() { return PROPELLANTS[this.stageDef.fuel]; }
}

export function rotY(p, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}
