import { ROCKETS } from './data/rockets.js';
import { DEFAULT_CONFIG, buildVehicle, vehicleStats } from './data/config.js';
import { MISSIONS, evaluate, progress, settings } from './data/missions.js';
import { FlightSim, LAUNCH_SITE } from './sim/flight.js';
import { DeliverySequence } from './sim/delivery.js';
import { FuelingSequence } from './sim/fueling.js';
import { PrelaunchSequence } from './sim/prelaunch.js';
import { RE, len, inertialToLatLon, OMEGA, clamp } from './sim/math.js';
import { View } from './render/scene.js';
import { WorldMap } from './render/map.js';
import { AudioSystem } from './render/audio.js';
import { UI } from './ui/ui.js';
import { units, toggleUnits } from './ui/units.js';

const WARPS = [1, 2, 4, 10, 25, 50];

class App {
  constructor() {
    settings.load(); progress.load();
    units.system = settings.data.units;
    this.ui = new UI(document.getElementById('ui'));
    this.view = new View(document.getElementById('gl'));
    this.mapCanvas = document.getElementById('map');
    this.map = new WorldMap(this.mapCanvas);
    this.audio = new AudioSystem(settings.data);
    this.state = 'menu';
    this.mission = null;
    this.rocket = ROCKETS[Math.floor(Math.random() * ROCKETS.length)];
    this.cfg = { ...DEFAULT_CONFIG };
    this.warpIdx = 0;
    this.mapOpen = false;
    this.keys = {};
    this.last = performance.now();
    this.spokenEvents = 0;
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('pointerdown', () => this.audio.ensure(), { once: false });
    this.view.setVehicle(buildVehicle(this.rocket, this.cfg));
    this.showMenu();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------- screens ----------------
  showMenu() {
    this.state = 'menu';
    this.sim = null;
    this.mapToggle(false);
    this.audio.setEngine(0, 0);
    this.audio.stopVoice();
    const menuRocket = ROCKETS[Math.floor(Math.random() * ROCKETS.length)];
    this.view.setVehicle(buildVehicle(menuRocket, DEFAULT_CONFIG));
    this.ui.menu(progress.data, {
      free: () => { this.mission = null; this.showRockets(); },
      missions: () => this.ui.missions(progress.data, (m) => { this.mission = m; this.showRockets(); }, () => this.showMenu()),
      settings: () => this.ui.settings(settings.data, (d) => { settings.save(); units.system = d.units; }, () => this.showMenu()),
      controls: () => this.ui.controls(() => this.showMenu()),
    });
  }

  showRockets() {
    this.state = 'rockets';
    const h = {
      select: (id) => { this.rocket = ROCKETS.find((r) => r.id === id); this.view.setVehicle(buildVehicle(this.rocket, this.cfg)); this.ui.rockets(id, this.mission, h); },
      next: () => this.showFuel(),
      back: () => this.showMenu(),
    };
    this.ui.rockets(this.rocket?.id, this.mission, h);
    if (this.rocket) this.view.setVehicle(buildVehicle(this.rocket, this.cfg));
  }

  showFuel() {
    this.state = 'fuel';
    const h = {
      pick: (id) => { this.cfg.fuel = id; this.view.setVehicle(buildVehicle(this.rocket, this.cfg)); this.ui.fuel(this.rocket, this.cfg, h); },
      next: () => this.showConfig(),
      back: () => this.showRockets(),
    };
    this.ui.fuel(this.rocket, this.cfg, h);
  }

  showConfig() {
    this.state = 'config';
    const refresh = () => { this.vehicle = buildVehicle(this.rocket, this.cfg); this.ui.configStats(this.vehicle, vehicleStats(this.vehicle)); this.view.setVehicle(this.vehicle); };
    this.ui.config(this.rocket, this.cfg, { change: refresh, next: () => this.startDelivery(), back: () => this.showFuel() });
    refresh();
  }

  startDelivery() {
    this.vehicle = buildVehicle(this.rocket, this.cfg);
    this.view.setVehicle(this.vehicle);
    this.delivery = new DeliverySequence(this.vehicle);
    this.state = 'delivery';
    this.ui.delivery(this.delivery, this.vehicle, { skip: () => { this.delivery.skip(); } });
    this.audio.say(`Shipping ${this.vehicle.name} hardware and propellant to the Cape.`);
  }

  startRollout() {
    this.state = 'rollout';
    this.rolloutT = 0;
    this.rolloutDur = 16;
    this.ui.rollout(this.vehicle, { skip: () => { this.rolloutT = this.rolloutDur; } });
    this.audio.say('Rollout to launch complex 39 A.');
  }

  showPad() {
    this.state = 'pad';
    this.ui.pad(this.vehicle, { fuel: () => this.startFueling(), menu: () => this.showMenu() });
  }

  startFueling() {
    this.state = 'fueling';
    this.fueling = new FuelingSequence(this.vehicle, { failures: settings.data.failures });
    this.fuelLogSpoken = 0;
    const f = this.fueling;
    this.ui.fueling(f, {
      vents: () => f.openVents(), all: () => f.startAll(), tank: (id) => f.startTank(id), press: () => f.pressurize(), arm: () => f.arm(), resume: () => f.resumeHold(),
      scrub: () => this.scrub('Operator scrub during propellant load'),
    });
  }

  scrub(reason) {
    this.audio.say(`Scrub. ${reason}. Detanking.`, true);
    this.state = 'detank';
    this.detankT = 0;
    this.detankFrom = this.fueling ? this.fueling.tanks.map((k) => k.level) : [];
    this.ui.toast(`SCRUB — ${reason}. Detanking…`, 6000);
    if (this.prelaunch) this.prelaunch.scrub(reason);
    this.ignited = false;
    this.sim = null;
    this.audio.setEngine(0, 0);
    if (this.fueling) { this.ui.fueling(this.fueling, {}); this.ui.updateFueling(this.fueling); }
  }

  startPrecheck() {
    this.state = 'precheck';
    this.prelaunch = new PrelaunchSequence({ failures: settings.data.failures });
    this.sim = new FlightSim(this.vehicle, { failures: settings.data.failures });
    this.applyDifficulty();
    const p = this.prelaunch;
    this.ui.precheck(p, {
      authorize: () => { p.authorize(); this.audio.say('Launch is authorized. T minus 10 seconds.', true); },
      recycle: () => p.recycle(),
      scrub: () => this.scrub('Scrub called during the count'),
    });
    this.audio.say('Beginning safety and pre-launch checks.');
  }

  applyDifficulty() {
    const d = settings.data.difficulty;
    this.sim.autopilot = d !== 'hard';
    this.sim.autoStage = d === 'easy';
    if (d === 'hard') this.sim.manualBase = { pitch: 90, heading: this.vehicle.azimuth };
  }

  startFlight() {
    this.state = 'flight';
    this.spokenEvents = this.sim.events.length;
    this.warpIdx = 0;
    this.paused = false;
    this.resultsShown = false;
    this.view.cameraMode = 'chase';
    this.view.controls.enabled = false;
    this.ui.flight({
      hold: (k, down) => { this.keys[k] = down; },
      tap: (k) => this.flightKey(k),
      stage: () => this.sim.separate(), auto: () => this.sim.setAutopilot(!this.sim.autopilot), camera: () => this.cycleCamera(),
      map: () => this.mapToggle(!this.mapOpen), warp: (d) => this.warp(d), pause: () => this.pauseToggle(),
    });
  }

  cycleCamera() { const m = this.view.cycleCamera(); this.ui.toast(`Camera: ${m}`); }
  warp(d) { this.warpIdx = clamp(this.warpIdx + d, 0, WARPS.length - 1); }
  mapToggle(open) {
    this.mapOpen = open;
    this.mapCanvas.classList.toggle('hidden', !open);
    if (!open) this.ui.hideMapInfo();
  }

  pauseToggle() {
    if (this.state !== 'flight') return;
    this.paused = !this.paused;
    if (this.paused) {
      this.ui.pause({
        resume: () => this.pauseToggle(),
        restart: () => { this.paused = false; this.restartLaunch(); },
        results: () => { this.paused = false; this.showResults(); },
        menu: () => { this.paused = false; this.showMenu(); },
      });
    } else this.ui.show('flight');
  }

  restartLaunch() {
    this.view.setVehicle(this.vehicle);
    this.startPrecheck();
  }

  showResults() {
    const result = evaluate(this.mission, this.sim, this.vehicle, settings.data.difficulty);
    if (!this.resultsRecorded) { progress.record(this.mission?.id, result, this.rocket.id); this.resultsRecorded = true; }
    this.state = 'results';
    this.mapToggle(false);
    this.ui.results(result, this.sim, this.vehicle, this.mission, {
      cont: () => { this.state = 'flight'; this.ui.show('flight'); this.resultsShown = true; },
      again: () => { this.resultsRecorded = false; this.restartLaunch(); },
      menu: () => this.showMenu(),
    });
    this.audio.say(result.success ? 'Mission objectives complete.' : 'Flight complete.');
  }

  // ---------------- input ----------------
  onKey(e, down) {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    this.keys[k] = down;
    if (!down) return;
    if (this.state === 'flight' && !this.paused) {
      this.flightKey(k, e);
    } else if (this.state === 'flight' && this.paused && k === 'escape') this.pauseToggle();
    else if (this.state === 'results' && k === 'escape') { this.state = 'flight'; this.ui.show('flight'); }
  }

  // one-shot flight commands shared by the keyboard and the touch buttons; returns true if handled
  flightKey(k, e) {
    if (this.state !== 'flight' || this.paused) return false;
    const s = this.sim;
    {
      if (k === ' ') { e?.preventDefault(); s.separate(); }
      else if (k === 'x') s.cutEngines();
      else if (k === 'r') s.igniteEngines();
      else if (k === 't') { s.setAutopilot(!s.autopilot); s.setAttMode('guidance'); }
      else if (k === '1') s.setAttMode(s.attMode === 'prograde' ? 'guidance' : 'prograde');
      else if (k === '2') s.setAttMode(s.attMode === 'retrograde' ? 'guidance' : 'retrograde');
      else if (k === 'p') s.deployPayload();
      else if (k === 'm') this.mapToggle(!this.mapOpen);
      else if (k === 'c') this.cycleCamera();
      else if (k === ',') this.warp(-1);
      else if (k === '.') this.warp(1);
      else if (k === 'u') { settings.data.units = toggleUnits(); settings.save(); }
      else if (k === 'escape') this.pauseToggle();
      else return false;
    }
    return true;
  }

  readInputs(dt) {
    const s = this.sim;
    if (!s) return;
    const pitch = (this.keys['w'] ? -1 : 0) + (this.keys['s'] ? 1 : 0);
    const yaw = (this.keys['d'] ? 1 : 0) + (this.keys['a'] ? -1 : 0);
    s.input.pitch = pitch; s.input.yaw = yaw;
    if ((pitch || yaw) && s.autopilot && settings.data.difficulty !== 'easy') { s.setAutopilot(false); this.ui.toast('Manual control — press T to re-engage autopilot'); }
    if (this.keys['e']) s.setThrottle(s.throttleCmd + dt * 0.6);
    if (this.keys['q']) s.setThrottle(s.throttleCmd - dt * 0.6);
  }

  // ---------------- main loop ----------------
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const ctx = { mode: 'pad' };

    if (this.state === 'menu' || this.state === 'rockets' || this.state === 'fuel' || this.state === 'config') {
      ctx.mode = 'showcase';
    } else if (this.state === 'delivery') {
      this.delivery.update(dt);
      this.ui.updateDelivery(this.delivery);
      ctx.mode = 'build';
      // a part appears on the vehicle once every shipment carrying that key has arrived
      const keyed = {};
      for (const it of this.delivery.items) if (it.key) { keyed[it.key] = keyed[it.key] || []; keyed[it.key].push(it.arrived); }
      ctx.assembly = new Set(Object.entries(keyed).filter(([, arr]) => arr.every(Boolean)).map(([k]) => k));
      if (this.delivery.done) { ctx.assembly = null; this.startRollout(); }
    } else if (this.state === 'rollout') {
      this.rolloutT += dt;
      const p = Math.min(1, this.rolloutT / this.rolloutDur);
      ctx.mode = 'rollout'; ctx.progress = p;
      this.ui.updateRollout(p);
      if (p >= 1) this.showPad();
    } else if (this.state === 'pad') {
      ctx.mode = 'pad'; ctx.cameraMode = 'padwide';
    } else if (this.state === 'fueling') {
      const f = this.fueling;
      f.update(dt);
      this.ui.updateFueling(f);
      while (this.fuelLogSpoken < f.log.length) { const e = f.log[this.fuelLogSpoken++]; if (e.kind === 'bad' || e.kind === 'good') this.audio.say(e.text); }
      ctx.mode = 'fuel'; ctx.vent = f.ventLevel; ctx.cameraMode = 'padwide';
      if (f.done) this.startPrecheck();
    } else if (this.state === 'detank') {
      this.detankT += dt;
      const p = Math.min(1, this.detankT / 14);
      if (this.fueling) this.fueling.tanks.forEach((k, i) => { if (!k.fixed) { k.level = this.detankFrom[i] * (1 - p); k.status = p < 1 ? 'DETANKING' : 'EMPTY'; k.started = null; } });
      if (this.fueling && this.ui.active === 'fueling') this.ui.updateFueling(this.fueling);
      ctx.mode = 'fuel'; ctx.vent = (1 - p) * 0.6; ctx.cameraMode = 'padwide';
      if (p >= 1) { this.ui.toast('Vehicle safed. Ready to recycle the count.', 3000); this.showPad(); }
    } else if (this.state === 'precheck') {
      const p = this.prelaunch;
      p.update(dt);
      this.ui.updatePrecheck(p);
      while (p.events.length) {
        const ev = p.events.shift();
        if (ev === 'ignite') { this.sim.t = -3; this.ignited = true; }
        if (ev === 'release') { this.startFlight(); }
      }
      if (p.phase === 'count' && Math.ceil(p.countdown) !== this.lastCount) { this.lastCount = Math.ceil(p.countdown); if (this.lastCount <= 10 && this.lastCount > 0) { this.audio.beep(this.lastCount <= 3 ? 1200 : 880); this.audio.say(String(this.lastCount)); } }
      if (this.ignited && this.sim.t < 0) { this.sim.advance(dt, 1); }
      const ignLevel = this.ignited ? clamp((this.sim.t + 3) / 2.2, 0, 1) : 0;
      this.audio.setEngine(ignLevel, 1);
      ctx.mode = this.ignited ? 'flight' : 'fuel'; ctx.sim = this.sim; ctx.cameraMode = 'pad'; ctx.vent = 0.25;
      if (p.phase === 'scrubbed') { /* handled by scrub() */ }
    } else if (this.state === 'flight' || this.state === 'results') {
      const s = this.sim;
      if (this.state === 'flight' && !this.paused) {
        this.readInputs(dt);
        let warp = WARPS[this.warpIdx];
        if (s.tel.alt < 120000 && s.status === 'ascent') warp = Math.min(warp, 4);
        s.advance(dt, warp);
        this.speakEvents();
        const ended = ['crashed', 'breakup', 'landed'].includes(s.status) || (s.status === 'suborbital' && s.tel.alt < 0);
        const orbitJustNow = s.status === 'orbit' && !this.resultsShown && !s.debris.some((d) => d.alive && d.reusable);
        if ((ended && !this.resultsShown) || orbitJustNow) { this.resultsShown = true; this.showResults(); }
        if (s.status === 'suborbital' && !this.resultsShown && s.stageState === 'done' && s.tel.vr < 0 && s.tel.alt < 50000) { this.resultsShown = true; this.showResults(); }
      }
      this.ui.updateHUD(s, { camera: this.view.cameraMode, warp: WARPS[this.warpIdx] });
      const atmo = clamp(s.tel.pressure / 101325 * 4, 0, 1);
      const power = s.throttle + (s.boosters.some((b) => b.attached && b.left > 0 && s.t >= 0) ? 1 : 0);
      this.audio.setEngine(this.paused ? 0 : Math.min(1, power), atmo);
      ctx.mode = 'flight'; ctx.sim = s;
      if (this.mapOpen) this.drawMap();
    }
    this.view.update(dt, ctx);
  }

  speakEvents() {
    const s = this.sim;
    while (this.spokenEvents < s.events.length) {
      const e = s.events[this.spokenEvents++];
      if (['good', 'bad', 'stage', 'warn'].includes(e.kind)) { this.audio.say(e.text, e.kind === 'bad'); if (e.kind === 'bad') this.audio.beep(300, 0.3, 0.2); }
    }
  }

  drawMap() {
    const s = this.sim;
    if (!this.predT || s.t - this.predT > 3) { this.predT = s.t; this.pred = s.predict(s.tel.el.period === Infinity ? 3000 : Math.min(s.tel.el.period, 7200), 15); }
    const debris = s.debris.map((d) => {
      let pos = null;
      if (d.alive) { const ll = inertialToLatLon(d.r, OMEGA * s.t); pos = { lat: ll.lat, lon: ll.lon, alt: len(d.r) - RE }; }
      return { name: d.name, kind: d.kind, alive: d.alive, impact: d.impact, pos };
    });
    this.map.draw({ site: LAUNCH_SITE, track: s.track, predicted: this.pred, debris, pos: { lat: s.tel.lat, lon: s.tel.lon, alt: s.tel.alt }, status: s.status, label: this.vehicle.name });
    this.ui.mapInfo(s);
  }
}

window.app = new App();
