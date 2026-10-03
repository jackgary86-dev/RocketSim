/**
 * Safety & pre-launch checks, the go/no-go poll, launch authorisation and the
 * T-10 terminal count. Runs automatically; with failures enabled a station can
 * call NO-GO and the operator must recycle or scrub.
 */
const CHECKS = [
  ['Range safety', 'Flight termination system armed and verified'],
  ['Range safety', 'Downrange hazard area clear of ships and aircraft'],
  ['Weather', 'Upper-level winds within limits'],
  ['Weather', 'Lightning rules clear — no cells within 10 nmi'],
  ['Propulsion', 'Tank pressures at flight level'],
  ['Propulsion', 'Engine chilldown complete'],
  ['Propulsion', 'Propellant temperatures within limits'],
  ['Avionics', 'Flight computer self-test passed'],
  ['Avionics', 'Transfer to internal power'],
  ['GNC', 'Inertial platform aligned'],
  ['GNC', 'Flight software loaded — guidance targets verified'],
  ['Structures', 'Hold-down posts and umbilicals verified'],
  ['Ground', 'Water deluge system armed'],
  ['Ground', 'Sound suppression water tanks full'],
  ['Payload', 'Spacecraft on internal power, GO for launch'],
  ['Telemetry', 'Downrange tracking stations acquiring'],
  ['Recovery', 'Recovery assets on station'],
  ['Safety', 'Pad personnel accounted for — fallback area clear'],
];

const STATIONS = ['Booster', 'Propulsion', 'Avionics', 'GNC', 'Range Safety', 'Weather', 'Payload', 'Recovery', 'Flight Dynamics', 'Ground Systems'];

const NOGO = [
  ['Weather', 'Upper-level wind shear exceeds limit', 'Winds subsiding — new balloon data within limits'],
  ['Propulsion', 'Engine chilldown temperature out of family', 'Extended chilldown bleed — temperatures in family'],
  ['Range Safety', 'Tracking radar dropout', 'Backup radar locked — range is GREEN'],
  ['Avionics', 'Transient on flight computer bus B', 'Bus B reset and verified clean'],
  ['Payload', 'Spacecraft battery voltage low', 'Trickle charge complete — payload is GO'],
];

export class PrelaunchSequence {
  constructor({ failures = false, rng = Math.random } = {}) {
    this.t = 0;
    this.phase = 'checks';       // checks | poll | authorize | count | liftoff | scrubbed
    this.checks = CHECKS.map(([who, text], i) => ({ who, text, state: 'pending', at: 1.2 + i * 1.6 }));
    this.poll = STATIONS.map((s, i) => ({ station: s, state: 'pending', at: 0.8 + i * 0.9 }));
    this.phaseT = 0;
    this.log = [];
    this.newLog = [];
    this.countdown = null;       // seconds to T-0
    this.ignitionCalled = false;
    this.events = [];
    this.nogo = null;
    this.holdResolved = false;
    if (failures && rng() < 0.5) {
      const [who, text, fix] = NOGO[Math.floor(rng() * NOGO.length)];
      const stationIdx = Math.max(0, STATIONS.findIndex((s) => s === who));
      this.nogo = { who, text, fix, stationIdx, len: 5 + rng() * 6, fired: false };
    }
    this.emit('LAUNCH DIRECTOR', 'Beginning safety and pre-launch checks');
  }

  emit(who, text, kind = 'info') {
    const e = { t: this.t, who, text, kind };
    this.log.push(e); this.newLog.push(e);
  }

  get checksDone() { return this.checks.every((c) => c.state === 'ok'); }
  get durationEstimate() { return this.checks[this.checks.length - 1].at + this.poll[this.poll.length - 1].at + 3; }

  update(dt) {
    this.t += dt;
    this.phaseT += dt;
    if (this.phase === 'checks') {
      for (const c of this.checks) {
        if (c.state === 'pending' && this.phaseT >= c.at) { c.state = 'ok'; this.emit(c.who.toUpperCase(), c.text); }
      }
      if (this.checksDone) {
        this.phase = 'poll'; this.phaseT = 0;
        this.emit('LAUNCH DIRECTOR', 'All checks complete. Polling stations for launch — go / no-go', 'good');
      }
    } else if (this.phase === 'poll') {
      for (let i = 0; i < this.poll.length; i++) {
        const p = this.poll[i];
        if (p.state === 'pending' && this.phaseT >= p.at) {
          if (this.nogo && !this.nogo.fired && i === this.nogo.stationIdx) {
            this.nogo.fired = true; p.state = 'nogo'; this.phase = 'hold'; this.holdLeft = this.nogo.len; this.holdResolved = false;
            this.emit(p.station.toUpperCase(), `NO-GO — ${this.nogo.text}`, 'bad');
            this.emit('LAUNCH DIRECTOR', 'Holding the count. Stand by for troubleshooting', 'warn');
            return;
          }
          p.state = 'go'; this.emit(p.station.toUpperCase(), 'GO', 'good');
        }
      }
      if (this.poll.every((p) => p.state === 'go')) {
        this.phase = 'authorize'; this.phaseT = 0;
        this.emit('LAUNCH DIRECTOR', 'All stations are GO. Vehicle is ready — awaiting launch authorisation', 'good');
      }
    } else if (this.phase === 'hold') {
      this.holdLeft -= dt;
      if (this.holdLeft <= 0 && !this.holdResolved) {
        this.holdResolved = true;
        this.emit(this.nogo.who.toUpperCase(), `${this.nogo.fix}. Ready to recycle the poll`, 'good');
      }
    } else if (this.phase === 'count') {
      const before = this.countdown;
      this.countdown -= dt;
      const crossed = (x) => before > x && this.countdown <= x;
      if (crossed(9.5)) this.emit('LAUNCH DIRECTOR', 'Terminal count — T-10 seconds');
      if (crossed(6)) this.emit('PROPULSION', 'Ignition sequence start');
      if (crossed(3)) { this.ignitionCalled = true; this.events.push('ignite'); this.emit('PROPULSION', 'Main engine ignition', 'good'); }
      if (crossed(1)) this.emit('PROPULSION', 'Engines at full thrust — hold-down release armed');
      if (this.countdown <= 0) { this.phase = 'liftoff'; this.events.push('release'); this.emit('LAUNCH DIRECTOR', 'Hold-down release — LIFTOFF', 'good'); }
    }
  }

  recycle() {
    if (this.phase !== 'hold' || !this.holdResolved) return;
    for (const p of this.poll) p.state = 'pending';
    this.phase = 'poll'; this.phaseT = 0;
    this.emit('LAUNCH DIRECTOR', 'Recycling the go/no-go poll', 'info');
  }

  authorize() {
    if (this.phase !== 'authorize') return;
    this.phase = 'count'; this.phaseT = 0; this.countdown = 10;
    this.emit('LAUNCH AUTHORITY', 'Launch is authorised. You are GO for launch', 'good');
  }

  scrub(reason = 'Operator scrub') {
    this.phase = 'scrubbed';
    this.emit('LAUNCH DIRECTOR', `SCRUB — ${reason}. Safing the vehicle and detanking`, 'bad');
  }
}
