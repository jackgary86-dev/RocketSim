import { ROCKETS, CLASSES } from '../data/rockets.js';
import { PROPELLANTS, LIQUIDS, UPGRADE_INFO, vehicleStats, buildVehicle } from '../data/config.js';
import { MISSIONS } from '../data/missions.js';
import { fmtTime } from '../sim/math.js';
import * as U from './units.js';
import { displayName, displayMaker } from '../data/names.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clsTag = (c) => `<span class="tag ${c === 'Super Heavy' ? 'super' : c.toLowerCase()}">${c}</span>`;
const stamp = (t) => (t < 0 ? `T-${Math.abs(t).toFixed(0).padStart(3, '0')}` : `T+${t.toFixed(0).padStart(3, '0')}`);

const STEPS = ['Rocket', 'Fuel', 'Build', 'Shipping', 'Rollout', 'Fueling', 'Checks', 'Launch'];
function steps(current) {
  const i = STEPS.indexOf(current);
  return `<div class="steps">${STEPS.map((s, k) => `<span class="${k < i ? 'done' : k === i ? 'on' : ''}">${k + 1}. ${s}</span>`).join('<span>›</span>')}</div>`;
}

/** DOM screens. Every screen is a div.screen inside #ui; only one is active at a time. */
export class UI {
  constructor(root) {
    this.root = root;
    this.screens = {};
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    root.appendChild(this.toastEl);
  }

  screen(name, html) {
    let s = this.screens[name];
    if (!s) { s = document.createElement('div'); s.className = 'screen'; s.dataset.name = name; this.root.appendChild(s); this.screens[name] = s; }
    s.innerHTML = html;
    return s;
  }
  show(name) {
    for (const [k, s] of Object.entries(this.screens)) s.classList.toggle('active', k === name);
    this.active = name;
  }
  on(scope, selector, event, fn) { scope.querySelectorAll(selector).forEach((el) => el.addEventListener(event, fn)); }
  toast(text, ms = 2200) {
    this.toastEl.textContent = text; this.toastEl.classList.add('on');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => this.toastEl.classList.remove('on'), ms);
  }

  // ---------------- menu ----------------
  menu(progress, h) {
    const done = Object.keys(progress.completed).length;
    const s = this.screen('menu', `
      <div class="menu-wrap">
        <h1>ROCKETSIM</h1>
        <div class="sub">LAUNCH OPERATIONS SIMULATOR · LC-39A</div>
        <button class="primary" data-a="free">▶ Free Play — pick any of 20 vehicles</button>
        <button data-a="missions">◎ Missions — ${done}/${MISSIONS.length} complete</button>
        <button data-a="settings">⚙ Settings &amp; Difficulty</button>
        <button data-a="controls">⌨ Controls</button>
        <div class="foot">Flights logged: ${progress.flights} · Best free-play score: ${progress.best.free || 0}<br>Mission-control realism · full-Earth tracking · 3-DOF ascent physics</div>
      </div>`);
    this.on(s, 'button', 'click', (e) => h[e.currentTarget.dataset.a]());
    this.show('menu');
  }

  controls(onBack) {
    const s = this.screen('controls', `
      <div class="modal panel">
        <h2>Controls</h2>
        <div class="keys" style="position:static;width:auto">
          <b>W / S</b> pitch down / up<br><b>A / D</b> yaw left / right<br><b>Q / E</b> throttle down / up<br>
          <b>SPACE</b> separate next stage / boosters<br><b>X</b> engine cutoff<br><b>R</b> relight engine<br>
          <b>T</b> toggle autopilot<br><b>1 / 2</b> hold prograde / retrograde (orbit)<br><b>P</b> deploy payload (orbit)<br>
          <b>M</b> world map<br><b>C</b> cycle camera<br><b>, / .</b> time warp down / up<br><b>U</b> units<br><b>ESC</b> pause
        </div>
        <button data-a="back" style="margin-top:12px">Back</button>
      </div>`);
    this.on(s, '[data-a=back]', 'click', onBack);
    this.show('controls');
  }

  settings(data, onChange, onBack) {
    const tog = (key, opts) => `<div class="toggle" data-key="${key}">${opts.map(([v, l]) => `<button class="${data[key] === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const s = this.screen('settings', `
      <div class="modal panel settings">
        <h2>Settings</h2>
        <div class="opt"><label>Difficulty</label>${tog('difficulty', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']])}
          <div class="hint">Easy: autopilot flies and stages. Normal: autopilot flies, you stage. Hard: you fly pitch, heading and staging.</div></div>
        <div class="opt"><label>Random failures</label>${tog('failures', [[true, 'On'], [false, 'Off']])}<div class="hint">Fueling holds, NO-GO polls, engine-outs and guidance drift.</div></div>
        <div class="opt"><label>Sound</label>${tog('sound', [[true, 'On'], [false, 'Off']])}</div>
        <div class="opt"><label>Voice callouts</label>${tog('voice', [[true, 'On'], [false, 'Off']])}</div>
        <div class="opt"><label>Units</label>${tog('units', [['imperial', 'Imperial'], ['metric', 'Metric']])}</div>
        <div class="opt"><label>Vehicle names</label>${tog('names', [['fictional', 'Fictional'], ['real', 'Real-world']])}<div class="hint">Fictional names are original; real-world names are for reference only.</div></div>
        <button data-a="back" style="margin-top:12px">Back</button>
      </div>`);
    this.on(s, '.toggle button', 'click', (e) => {
      const key = e.currentTarget.parentElement.dataset.key;
      let v = e.currentTarget.dataset.v; if (v === 'true') v = true; if (v === 'false') v = false;
      data[key] = v; onChange(data);
      e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
    });
    this.on(s, '[data-a=back]', 'click', onBack);
    this.show('settings');
  }

  missions(progress, onPick, onBack) {
    const s = this.screen('missions', `
      <div class="full">
        <div class="head"><h2>Missions</h2><button data-a="back">Back</button></div>
        <div class="body"><div class="cards">${MISSIONS.map((m) => {
          const c = progress.completed[m.id];
          return `<div class="card ${c ? 'done' : ''}" data-id="${m.id}"><div class="name">${m.name}</div><div class="meta">${m.rocketClass ? clsTag(m.rocketClass) : '<span class="tag">any class</span>'} ${c ? `<span class="green">best ${c.score}</span>` : ''}</div><div>${esc(m.brief)}</div></div>`;
        }).join('')}</div></div>
        <div class="foot"><span class="muted">Select a mission to choose a vehicle for it.</span></div>
      </div>`);
    this.on(s, '.card', 'click', (e) => onPick(MISSIONS.find((m) => m.id === e.currentTarget.dataset.id)));
    this.on(s, '[data-a=back]', 'click', onBack);
    this.show('missions');
  }

  // ---------------- rocket select ----------------
  rockets(selectedId, mission, h) {
    const s = this.screen('rockets', `
      <div class="full">
        <div class="head"><div><h2>Select launch vehicle${mission ? ` — ${esc(mission.name)}` : ''}</h2>${steps('Rocket')}</div><button data-a="back">Back</button></div>
        <div class="body"><div class="cards">${ROCKETS.map((r) => `<div class="card ${r.id === selectedId ? 'selected' : ''} ${mission?.rocketClass && mission.rocketClass !== r.class ? 'locked' : ''}" data-id="${r.id}">
          <div class="name">${esc(displayName(r))}</div><div class="meta">${esc(displayMaker(r))} · ${esc(r.country)} · ${r.era}</div>
          <div class="stats"><span>${clsTag(r.class)}</span><span>${r.stages.length} stage${r.stages.length > 1 ? 's' : ''}${r.boosters ? ` + ${r.boosters.count} boosters` : ''}</span><span>Height <b>${r.height} m</b></span><span>LEO <b>${r.payload} t</b></span></div></div>`).join('')}</div></div>
        <div class="foot"><span class="muted">Click a vehicle to inspect it on the pad.</span><button class="primary" data-a="next" ${selectedId ? '' : 'disabled'}>Select propellant ›</button></div>
      </div>
      <div class="detail panel" id="rocket-detail"></div>`);
    this.on(s, '.card', 'click', (e) => h.select(e.currentTarget.dataset.id));
    this.on(s, '[data-a=next]', 'click', h.next);
    this.on(s, '[data-a=back]', 'click', h.back);
    this.show('rockets');
    if (selectedId) this.rocketDetail(ROCKETS.find((r) => r.id === selectedId));
  }
  rocketDetail(r) {
    const el = this.screens.rockets.querySelector('#rocket-detail');
    if (!r) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const st = vehicleStats(buildVehicle(r));
    el.innerHTML = `<div class="big">${esc(displayName(r))}</div><div class="muted" style="margin:4px 0 10px">${esc(r.desc)}</div>
      <div class="kv"><span>Class</span><span>${r.class}</span><span>Height / diameter</span><span>${r.height} m / ${r.diameter} m</span><span>Liftoff mass</span><span>${U.massT(st.glow)}</span><span>Liftoff thrust</span><span>${U.force(st.liftThrust * 1000)}</span><span>Thrust-to-weight</span><span>${st.twr.toFixed(2)}</span><span>Ideal Δv</span><span>${(st.dv / 1000).toFixed(2)} km/s</span><span>Stages</span><span>${r.stages.map((s) => `${esc(s.name)} (${PROPELLANTS[s.fuel].name})`).join('<br>')}</span></div>`;
  }

  // ---------------- fuel ----------------
  fuel(rocket, cfg, h) {
    const cards = ['stock', ...LIQUIDS].map((id) => {
      const P = id === 'stock' ? null : PROPELLANTS[id];
      const v = buildVehicle(rocket, { ...cfg, fuel: id });
      const st = vehicleStats(v);
      const liquidStages = rocket.stages.filter((s) => s.fuel !== 'solid');
      return `<div class="card fuel ${cfg.fuel === id ? 'selected' : ''}" data-id="${id}">
        <div class="name">${P ? P.name : 'Stock propellants'}</div>
        <div class="meta">${P ? `${P.fuel} / ${P.ox} · O/F ${P.of}` : 'As designed by the manufacturer'}</div>
        <div class="plume" style="background:linear-gradient(90deg,#${(P ? P.plume : 0xffa040).toString(16).padStart(6, '0')},transparent)"></div>
        <div class="muted">${P ? esc(P.blurb) : 'Every liquid stage uses its original propellant combination.'}</div>
        <div class="stage-list">${v.stages.map((s) => `<div><span>${esc(s.name)}</span><span>${PROPELLANTS[s.fuel].name} · Isp ${s.ispVac.toFixed(0)} s</span></div>`).join('')}</div>
        <div class="stats" style="margin-top:8px"><span>Δv <b>${(st.dv / 1000).toFixed(2)} km/s</b></span><span>TWR <b>${st.twr.toFixed(2)}</b></span><span>Margin <b class="${st.margin > 0 ? 'green' : 'red'}">${(st.margin / 1000).toFixed(2)} km/s</b></span><span>Mass <b>${U.massT(st.glow)}</b></span></div>
        ${liquidStages.length === 0 ? '<div class="amber" style="margin-top:6px">All-solid vehicle — propellant is fixed</div>' : ''}
      </div>`;
    }).join('');
    const s = this.screen('fuel', `
      <div class="full">
        <div class="head"><div><h2>Propellant selection — ${esc(displayName(rocket))}</h2>${steps('Fuel')}</div><button data-a="back">Back</button></div>
        <div class="body"><div class="fuel-grid">${cards}</div>
          <p class="muted" style="max-width:900px">Swapping propellant rescales each liquid stage's specific impulse and tank mass for the new bulk density. Solid motors cannot be changed. Cryogenic propellants add chilldown time and boil-off during loading.</p></div>
        <div class="foot"><span class="muted">Choose a propellant family.</span><button class="primary" data-a="next">Configure vehicle ›</button></div>
      </div>`);
    this.on(s, '.card', 'click', (e) => h.pick(e.currentTarget.dataset.id));
    this.on(s, '[data-a=next]', 'click', h.next);
    this.on(s, '[data-a=back]', 'click', h.back);
    this.show('fuel');
  }

  // ---------------- config ----------------
  config(rocket, cfg, h) {
    const slider = (key, label, min, max, step, unit) => `<div class="opt"><label>${label}</label><input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${cfg[key]}"><span class="val" data-val="${key}">${cfg[key]}${unit}</span><div class="hint">${UPGRADE_INFO[key]}</div></div>`;
    const tog = (key, label, opts) => `<div class="opt"><label>${label}</label><div class="toggle" data-key="${key}">${opts.map(([v, l]) => `<button class="${String(cfg[key]) === String(v) ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div><span></span><div class="hint">${UPGRADE_INFO[key]}</div></div>`;
    const s = this.screen('config', `
      <div class="full">
        <div class="head"><div><h2>Vehicle configuration — ${esc(displayName(rocket))}</h2>${steps('Build')}</div><button data-a="back">Back</button></div>
        <div class="body"><div class="config-grid">
          <div class="panel">
            <h3>Range &amp; performance</h3>
            ${slider('tankStretch', 'Tank stretch', 0, 25, 1, '%')}
            ${slider('extraBoosters', 'Extra strap-on solids', 0, 6, 1, '')}
            ${slider('engineUprate', 'Engine thrust uprate', 0, 15, 1, '%')}
            ${tog('vacNozzle', 'Vacuum nozzle extensions', [[false, 'Standard'], [true, 'Extended']])}
            ${tog('composites', 'Composite structures', [[false, 'Aluminium'], [true, 'Composite']])}
            ${tog('controlFins', 'Control surfaces', [['none', 'None'], ['aero', 'Fins'], ['grid', 'Grid fins']])}
            <h3>Mission</h3>
            ${slider('payloadPct', 'Payload mass', 10, 120, 5, '%')}
            ${slider('targetAlt', 'Target orbit altitude', 160, 1200, 10, ' km')}
            ${slider('azimuth', 'Launch azimuth', 35, 120, 1, '°')}
          </div>
          <div class="panel" id="cfg-stats"></div>
        </div></div>
        <div class="foot"><span class="muted" id="cfg-warn"></span><button class="primary" data-a="next">Build &amp; ship to the Cape ›</button></div>
      </div>`);
    this.on(s, 'input[type=range]', 'input', (e) => { const k = e.target.dataset.key; cfg[k] = +e.target.value; s.querySelector(`[data-val=${k}]`).textContent = e.target.value + (k === 'targetAlt' ? ' km' : k === 'azimuth' ? '°' : k === 'extraBoosters' ? '' : '%'); h.change(); });
    this.on(s, '.toggle button', 'click', (e) => { const key = e.currentTarget.parentElement.dataset.key; let v = e.currentTarget.dataset.v; if (v === 'true') v = true; if (v === 'false') v = false; cfg[key] = v; e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); h.change(); });
    this.on(s, '[data-a=next]', 'click', h.next);
    this.on(s, '[data-a=back]', 'click', h.back);
    this.show('config');
  }
  configStats(vehicle, st) {
    const el = this.screens.config.querySelector('#cfg-stats');
    const warn = this.screens.config.querySelector('#cfg-warn');
    const pct = Math.min(100, (st.dv / (st.needed * 1.3)) * 100);
    el.innerHTML = `<h3>Performance estimate</h3>
      <div class="stat"><span>Liftoff mass</span><b>${U.massT(st.glow)}</b></div>
      <div class="stat"><span>Payload</span><b>${U.massT(vehicle.payload)}</b></div>
      <div class="stat"><span>Liftoff thrust</span><b>${U.force(st.liftThrust * 1000)}</b></div>
      <div class="stat"><span>Thrust-to-weight</span><b class="${st.twr < 1.05 ? 'red' : st.twr < 1.2 ? 'amber' : 'green'}">${st.twr.toFixed(2)}</b></div>
      <div class="stat"><span>Ideal Δv</span><b>${(st.dv / 1000).toFixed(2)} km/s</b></div>
      <div class="stat"><span>Needed for ${vehicle.config.targetAlt} km</span><b>${(st.needed / 1000).toFixed(2)} km/s</b></div>
      <div class="stat"><span>Margin</span><b class="${st.margin > 600 ? 'green' : st.margin > 0 ? 'amber' : 'red'}">${st.margin >= 0 ? '+' : ''}${(st.margin / 1000).toFixed(2)} km/s</b></div>
      <div class="bar ${st.margin > 600 ? 'green' : st.margin > 0 ? 'amber' : 'red'}" style="margin-top:8px"><i style="width:${pct}%"></i></div>
      <h3>Stage Δv</h3>${vehicle.stages.map((s, i) => `<div class="stat"><span>${esc(s.name)}</span><b>${(st.stageDv[i] / 1000).toFixed(2)} km/s</b></div>`).join('')}
      ${vehicle.boosters.length ? `<h3>Boosters</h3>${vehicle.boosters.map((b) => `<div class="stat"><span>${esc(b.name)} ×${b.count}</span><b>${U.force(b.thrust * b.count * 1000)}</b></div>`).join('')}` : ''}`;
    warn.textContent = st.twr < 1.05 ? '⚠ Thrust-to-weight below 1.05 — the vehicle will not leave the pad.' : st.margin < 0 ? '⚠ Δv margin negative — expect a suborbital trajectory.' : '';
    warn.className = st.twr < 1.05 || st.margin < 0 ? 'red' : 'muted';
  }

  // ---------------- delivery ----------------
  delivery(seq, vehicle, h) {
    const s = this.screen('delivery', `
      <div class="delivery">
        <div class="panel"><h2>Shipping to LC-39A — ${esc(displayName(vehicle))}</h2>${steps('Shipping')}<div class="bar" style="margin-top:10px"><i id="dl-bar" style="width:0%"></i></div>
          <div class="row spread" style="margin-top:6px;font-size:11px"><span class="muted" id="dl-count"></span><span class="muted" id="dl-mass"></span></div></div>
        <div class="current" id="dl-current"><div class="muted">Loading manifest…</div></div>
        <div class="manifest" id="dl-list">${seq.items.map((it, i) => `<div data-i="${i}" class="${it.hazmat ? 'hazmat' : ''}"><span>${it.icon} ${esc(it.title)}</span><span>${U.massT(it.mass)}</span></div>`).join('')}</div>
        <div class="row spread"><span class="muted">${seq.items.length} shipments · ${seq.duration.toFixed(0)} s</span><button data-a="skip">Skip ›</button></div>
      </div>`);
    this.on(s, '[data-a=skip]', 'click', h.skip);
    this.show('delivery');
  }
  updateDelivery(seq) {
    const s = this.screens.delivery;
    s.querySelector('#dl-bar').style.width = `${(seq.t / seq.duration) * 100}%`;
    s.querySelector('#dl-count').textContent = `${seq.items.filter((i) => i.arrived).length} / ${seq.items.length} arrived`;
    s.querySelector('#dl-mass').textContent = `${U.massT(seq.delivered)} of ${U.massT(seq.totalMass)} delivered`;
    seq.items.forEach((it, i) => { s.querySelector(`#dl-list [data-i="${i}"]`).classList.toggle('arrived', it.arrived); });
    const cur = seq.current;
    if (cur && cur !== this._dlShown) {
      this._dlShown = cur;
      s.querySelector('#dl-current').innerHTML = `<div class="icon">${cur.icon}</div><div class="title">${esc(cur.title)}</div><div class="sub">${esc(cur.sub)}</div><div class="kv"><span>Mass</span><span>${U.massT(cur.mass)}</span><span>Transport</span><span>${esc(cur.transport)}</span><span>Origin</span><span>${esc(cur.origin)}</span>${cur.trucks ? `<span>Tankers</span><span>${cur.trucks}</span>` : ''}</div>${cur.hazmat ? '<div class="amber" style="margin-top:8px">⚠ Hazardous cargo — escorted convoy</div>' : ''}`;
      const row = s.querySelector(`#dl-list [data-i="${seq.items.indexOf(cur)}"]`);
      row?.scrollIntoView({ block: 'nearest' });
    }
  }

  // ---------------- rollout / pad ----------------
  rollout(vehicle, h) {
    const s = this.screen('rollout', `
      <div class="progress panel"><h2>Rollout to Launch Complex 39A</h2>${steps('Rollout')}<div class="bar"><i id="ro-bar" style="width:0%"></i></div><div class="muted" id="ro-text" style="margin-top:6px">Transporter departing the integration facility</div></div>
      <div class="hint-bar"><button data-a="skip">Skip ›</button></div>`);
    this.on(s, '[data-a=skip]', 'click', h.skip);
    this.show('rollout');
  }
  updateRollout(p) {
    const s = this.screens.rollout;
    s.querySelector('#ro-bar').style.width = `${p * 100}%`;
    s.querySelector('#ro-text').textContent = p < 0.72 ? `Crawling along the crawlerway — ${(790 * (1 - p / 0.72)).toFixed(0)} m to the pad` : p < 1 ? 'Erecting the vehicle on the launch mount' : 'Vehicle vertical — hold-downs engaged';
  }

  pad(vehicle, h) {
    const s = this.screen('pad', `
      <div class="actions"><div class="panel"><h2>Vehicle on pad — ${esc(displayName(vehicle))}</h2>${steps('Fueling')}
        <div class="muted" style="margin:8px 0">Umbilicals connected. Launch mount hold-downs engaged. The vehicle is dry and ready for propellant loading.</div>
        <button class="primary" data-a="fuel">Begin propellant loading ›</button><button data-a="menu">Abort to menu</button></div></div>`);
    this.on(s, '[data-a=fuel]', 'click', h.fuel);
    this.on(s, '[data-a=menu]', 'click', h.menu);
    this.show('pad');
  }

  // ---------------- fueling ----------------
  fueling(seq, h) {
    const s = this.screen('fueling', `
      <div class="topbar"><span class="ph">Propellant load</span><span class="clock" id="fu-clock">00:00</span><span class="ph" id="fu-phase">IDLE</span></div>
      <div class="fuel-panel"><div class="panel"><h2>Tank status</h2><div class="bar"><i id="fu-bar" style="width:0%"></i></div><div class="muted" id="fu-mass" style="margin-top:6px"></div></div>
        <div class="tanks" id="fu-tanks"></div>
        <div class="panel"><div class="row"><button data-a="vents" id="fu-vents" class="primary">1 · Open vents &amp; purge</button><button data-a="all" id="fu-all" disabled>2 · Start all loads</button><button data-a="press" id="fu-press" disabled>3 · Pressurise</button><button data-a="arm" id="fu-arm" disabled>4 · Arm</button></div>
          <div class="row" style="margin-top:8px"><button data-a="resume" id="fu-resume" class="go" style="display:none">Resume count</button><button class="danger" data-a="scrub">Scrub &amp; detank</button><span class="muted" id="fu-hint">Open the vents to begin.</span></div></div>
      </div>
      <div class="console" id="fu-log"></div>`);
    this.on(s, '[data-a=vents]', 'click', h.vents);
    this.on(s, '[data-a=all]', 'click', h.all);
    this.on(s, '[data-a=press]', 'click', h.press);
    this.on(s, '[data-a=arm]', 'click', h.arm);
    this.on(s, '[data-a=resume]', 'click', h.resume);
    this.on(s, '[data-a=scrub]', 'click', h.scrub);
    s.querySelector('#fu-tanks').addEventListener('click', (e) => { const b = e.target.closest('button[data-tank]'); if (b) h.tank(+b.dataset.tank); });
    this._fuLog = 0;
    this.show('fueling');
  }
  updateFueling(seq) {
    const s = this.screens.fueling;
    s.querySelector('#fu-clock').textContent = fmtTime(seq.t, false);
    s.querySelector('#fu-phase').textContent = seq.holding ? 'HOLD' : seq.phase.toUpperCase();
    s.querySelector('#fu-phase').style.color = seq.holding ? 'var(--red)' : 'var(--amber)';
    s.querySelector('#fu-bar').style.width = `${seq.progress * 100}%`;
    s.querySelector('#fu-mass').textContent = `${U.massT(seq.loadedMass)} loaded of ${U.massT(seq.totalMass)}`;
    const tanks = s.querySelector('#fu-tanks');
    if (tanks.children.length !== seq.tanks.length) {
      tanks.innerHTML = seq.tanks.map((k) => `<div class="tank" data-id="${k.id}"><div class="nm"><b>${esc(k.group)}</b> · ${k.name} — ${k.prop}</div><div class="row"><span class="st"></span>${!k.fixed ? `<button data-tank="${k.id}">Start load</button>` : ''}</div><div class="bar"><i></i></div><div class="rd"><span class="lv"></span><span class="tp"></span><span class="pr"></span></div></div>`).join('');
    }
    for (const k of seq.tanks) {
      const el = tanks.querySelector(`[data-id="${k.id}"]`);
      el.querySelector('.st').textContent = k.status; el.querySelector('.st').style.color = k.status.includes('FLIGHT') || k.status === 'ARMED' ? 'var(--green)' : k.level > 0.99 ? 'var(--cyan)' : 'var(--amber)';
      el.querySelector('.bar i').style.width = `${k.level * 100}%`;
      el.querySelector('.bar').className = `bar ${k.level > 0.99 ? 'green' : ''}`;
      el.querySelector('.lv').textContent = `${(k.level * 100).toFixed(1)} % · ${U.massT(k.cap * k.level)}`;
      el.querySelector('.tp').textContent = U.temp(k.temp);
      el.querySelector('.pr').textContent = U.pressBar(k.press);
      const b = el.querySelector('button'); if (b) { b.disabled = seq.phase !== 'load' || k.started !== null || seq.holding; b.textContent = k.started !== null ? 'Loading' : 'Start load'; }
    }
    s.querySelector('#fu-vents').disabled = seq.phase !== 'idle';
    s.querySelector('#fu-all').disabled = seq.phase !== 'load' || seq.holding || seq.liquidTanks.every((k) => k.started !== null);
    s.querySelector('#fu-press').disabled = !(seq.phase === 'load' && seq.allLoaded && !seq.holding);
    s.querySelector('#fu-arm').disabled = seq.phase !== 'arm';
    s.querySelector('#fu-resume').style.display = seq.holding && seq.holdResolved ? 'inline-block' : 'none';
    const hint = seq.holding ? (seq.holdResolved ? 'Issue resolved — resume the count.' : 'HOLD — troubleshooting in progress…') : seq.phase === 'idle' ? 'Open the vents to begin.' : seq.phase === 'purge' ? 'Purging transfer lines…' : seq.phase === 'load' ? (seq.allLoaded ? 'All tanks at flight level — pressurise.' : 'Start each tank load (or start all).') : seq.phase === 'press' ? 'Pressurising…' : seq.phase === 'arm' ? 'Arm the propellant system to finish.' : 'Complete.';
    s.querySelector('#fu-hint').textContent = hint;
    this.appendLog(s.querySelector('#fu-log'), seq.log, '_fuLog');
  }
  appendLog(el, log, counterKey) {
    while (this[counterKey] < log.length) {
      const e = log[this[counterKey]++];
      const d = document.createElement('div'); d.className = e.kind || '';
      d.innerHTML = `<span class="t">${fmtTime(e.t, false)}</span><span class="w">${esc(e.who || '')}</span>${esc(e.text)}`;
      el.appendChild(d); el.scrollTop = el.scrollHeight;
    }
  }

  // ---------------- prechecks / countdown ----------------
  precheck(seq, h) {
    const s = this.screen('precheck', `
      <div class="topbar"><span class="ph">Pre-launch</span><span class="clock" id="pc-clock">T-00:00</span><span class="ph" id="pc-phase">CHECKS</span></div>
      <div class="big-count" id="pc-count"></div>
      <div class="fuel-panel"><div class="panel"><h2>Safety &amp; pre-launch checks</h2>${steps('Checks')}</div>
        <div class="panel" style="overflow:auto"><div class="checks" id="pc-checks"></div><h3>Go / No-Go poll</h3><div class="poll" id="pc-poll"></div></div>
        <div class="panel"><div class="row"><button class="go" data-a="auth" id="pc-auth" disabled>AUTHORIZE LAUNCH</button><button data-a="recycle" id="pc-recycle" style="display:none">Recycle poll</button><button class="danger" data-a="scrub">Scrub</button></div><div class="muted" id="pc-hint" style="margin-top:8px"></div></div>
      </div>
      <div class="console" id="pc-log"></div>`);
    this.on(s, '[data-a=auth]', 'click', h.authorize);
    this.on(s, '[data-a=recycle]', 'click', h.recycle);
    this.on(s, '[data-a=scrub]', 'click', h.scrub);
    this._pcLog = 0;
    this.show('precheck');
  }
  updatePrecheck(seq) {
    const s = this.screens.precheck;
    const cd = seq.countdown;
    s.querySelector('#pc-clock').textContent = seq.phase === 'count' || seq.phase === 'liftoff' ? `T-${Math.max(0, cd).toFixed(0).padStart(2, '0')}` : `T-00:${Math.max(0, Math.ceil(10 + (seq.durationEstimate - seq.t))).toFixed(0).padStart(2, '0')}`;
    s.querySelector('#pc-phase').textContent = seq.phase.toUpperCase();
    s.querySelector('#pc-count').textContent = seq.phase === 'count' ? Math.ceil(cd) : seq.phase === 'liftoff' ? 'LIFTOFF' : '';
    const checks = s.querySelector('#pc-checks');
    if (checks.children.length !== seq.checks.length) checks.innerHTML = seq.checks.map((c) => `<div><span class="w">${c.who}</span><span style="flex:1">${esc(c.text)}</span><span class="s"></span></div>`).join('');
    seq.checks.forEach((c, i) => { const el = checks.children[i]; el.className = c.state; el.querySelector('.s').textContent = c.state === 'ok' ? 'GO' : '…'; });
    const poll = s.querySelector('#pc-poll');
    if (poll.children.length !== seq.poll.length) poll.innerHTML = seq.poll.map((p) => `<div>${p.station}</div>`).join('');
    seq.poll.forEach((p, i) => { poll.children[i].className = p.state; poll.children[i].textContent = `${p.station}${p.state === 'go' ? ' · GO' : p.state === 'nogo' ? ' · NO-GO' : ''}`; });
    s.querySelector('#pc-auth').disabled = seq.phase !== 'authorize';
    s.querySelector('#pc-recycle').style.display = seq.phase === 'hold' && seq.holdResolved ? 'inline-block' : 'none';
    s.querySelector('#pc-hint').textContent = seq.phase === 'checks' ? 'Automated checks running…' : seq.phase === 'poll' ? 'Polling stations…' : seq.phase === 'hold' ? (seq.holdResolved ? 'Issue cleared — recycle the poll.' : 'NO-GO — troubleshooting…') : seq.phase === 'authorize' ? 'All stations GO. Launch authority: your call.' : seq.phase === 'count' ? 'Terminal count running.' : '';
    this.appendLog(s.querySelector('#pc-log'), seq.log, '_pcLog');
  }

  // ---------------- flight HUD ----------------
  flight(h) {
    const s = this.screen('flight', `
      <div class="hud-top"><div class="met" id="h-met">T+00:00</div><div class="st" id="h-status">ASCENT</div><div class="prompt" id="h-prompt"></div></div>
      <div class="warnbox" id="h-warn"></div>
      <div class="hud-left"><div class="panel"><div class="tel" id="h-tel"></div></div></div>
      <div class="hud-right"><div class="panel"><div class="navball" id="h-nav"></div></div><div class="panel"><div class="stages" id="h-stages"></div></div></div>
      <div class="hud-log" id="h-log"></div>
      <div class="hud-bottom">
        <button data-a="stage">SPACE · Stage</button><button data-a="auto" id="h-auto">T · Autopilot</button><button data-a="cam">C · Camera</button><button data-a="map">M · Map</button><button data-a="warp-">,</button><span id="h-warp" style="padding:7px 4px;color:var(--cyan)">1×</span><button data-a="warp+">.</button><button data-a="pause">ESC</button>
      </div>
      <div class="keys" id="h-keys"><b>W/S · A/D</b> pitch · yaw<br><b>Q / E</b> throttle<br><b>X / R</b> cutoff / relight<br><b>1 / 2 / P</b> prograde · retrograde · deploy</div>`);
    this.on(s, '[data-a=stage]', 'click', h.stage);
    this.on(s, '[data-a=auto]', 'click', h.auto);
    this.on(s, '[data-a=cam]', 'click', h.camera);
    this.on(s, '[data-a=map]', 'click', h.map);
    this.on(s, '[data-a="warp-"]', 'click', () => h.warp(-1));
    this.on(s, '[data-a="warp+"]', 'click', () => h.warp(1));
    this.on(s, '[data-a=pause]', 'click', h.pause);
    this._hLog = 0;
    this.show('flight');
  }
  updateHUD(sim, info) {
    const s = this.screens.flight;
    const t = sim.tel, el = t.el;
    s.querySelector('#h-met').textContent = fmtTime(sim.t);
    const statusText = { ascent: sim.liftedOff ? 'ASCENT' : 'IGNITION', orbit: 'IN ORBIT — ORBIT OPS', suborbital: 'SUBORBITAL', reentry: 'REENTRY', landed: 'SPLASHDOWN', crashed: 'VEHICLE LOST', breakup: 'VEHICLE BREAKUP' }[sim.status];
    s.querySelector('#h-status').textContent = `${statusText} · ${sim.autopilot ? 'AUTO' : sim.attMode !== 'guidance' ? sim.attMode.toUpperCase() + ' HOLD' : 'MANUAL'} · cam ${info.camera}`;
    const prompt = s.querySelector('#h-prompt');
    const boosterReady = sim.boosters.some((b) => b.attached && b.burnedOut);
    const stageReady = sim.stageState === 'burnout' && !sim.isFinalStage;
    prompt.textContent = (!sim.autoStage && (boosterReady || stageReady)) ? (boosterReady ? 'BOOSTER BURNOUT — PRESS SPACE TO SEPARATE' : 'STAGE BURNOUT — PRESS SPACE TO SEPARATE') : '';
    prompt.classList.toggle('on', !!prompt.textContent);
    const warn = s.querySelector('#h-warn');
    const qa = t.q * t.aoa;
    warn.textContent = qa > 150000 && t.alt < 80000 ? `AERO LOAD ${(qa / 1000).toFixed(0)} — REDUCE ANGLE OF ATTACK` : sim.status === 'reentry' && t.heat > 5e5 ? 'PEAK HEATING' : '';
    warn.classList.toggle('on', !!warn.textContent);
    const g = t.accel / 9.80665;
    s.querySelector('#h-tel').innerHTML = `
      <span>ALTITUDE</span><span>${U.alt(t.alt)}</span><span>VELOCITY</span><span>${U.speed(t.speed)}</span><span>AIRSPEED</span><span>${U.speed(t.speedRel)}</span>
      <span>VERT SPEED</span><span>${U.speed(t.vr)}</span><span>DOWNRANGE</span><span>${U.dist(t.downrange)}</span><span class="sep"></span>
      <span>MACH</span><span>${t.mach.toFixed(2)}</span><span>DYN PRESS</span><span>${U.press(t.q)}</span><span>ACCEL</span><span>${g.toFixed(2)} g</span><span>AOA</span><span>${t.aoa.toFixed(1)}°</span><span class="sep"></span>
      <span>APOGEE</span><span>${el.apoapsis === Infinity ? '∞' : U.alt(el.apoapsis)}</span><span>PERIGEE</span><span>${U.alt(el.periapsis)}</span><span>INCLINATION</span><span>${el.inc.toFixed(2)}°</span><span>PERIOD</span><span>${el.period === Infinity ? '—' : fmtTime(el.period, false)}</span><span class="sep"></span>
      <span>MASS</span><span>${U.mass(t.mass)}</span><span>THRUST</span><span>${U.force(t.thrust)}</span><span>THROTTLE</span><span>${(sim.throttle * 100).toFixed(0)}% (cmd ${(sim.throttleCmd * 100).toFixed(0)}%)</span><span>LAT / LON</span><span>${t.lat.toFixed(2)}° ${t.lon.toFixed(2)}°</span>`;
    s.querySelector('#h-nav').innerHTML = `<div>PITCH<b>${t.pitch.toFixed(1)}°</b></div><div>HEADING<b>${t.heading.toFixed(0)}°</b></div><div>FPA<b>${t.flightPath.toFixed(1)}°</b></div><div>WARP<b>${info.warp}×</b></div>`;
    const stages = sim.stageInfo(), boosters = sim.boosterInfo();
    s.querySelector('#h-stages').innerHTML = [...boosters.map((b) => `<div class="${b.attached ? '' : 'sep'}"><div class="lbl"><span>${esc(b.name)} ×${b.count}</span><span>${b.attached ? (b.frac > 0 ? 'BURN' : 'BURNOUT') : 'SEPARATED'}</span></div><div class="bar amber"><i style="width:${b.frac * 100}%"></i></div></div>`),
      ...stages.map((st) => `<div class="${st.state === 'sep' ? 'sep' : st.state === 'burn' ? 'burn' : ''}"><div class="lbl"><span>${esc(st.name)}</span><span>${{ sep: 'SEPARATED', burn: sim.engineLit && st.state === 'burn' ? 'BURN' : 'STANDBY', burnout: 'BURNOUT', coast: 'IGNITING', done: 'DEPLETED', wait: 'WAIT' }[st.state]}</span></div><div class="bar ${st.state === 'burn' ? 'green' : ''}"><i style="width:${st.frac * 100}%"></i></div></div>`)].join('');
    s.querySelector('#h-auto').classList.toggle('on', sim.autopilot);
    s.querySelector('#h-warp').textContent = `${info.warp}×`;
    const log = s.querySelector('#h-log');
    while (this._hLog < sim.events.length) {
      const e = sim.events[this._hLog++];
      const d = document.createElement('div'); d.className = e.kind;
      d.innerHTML = `<span class="t">${stamp(e.t)}</span>${esc(e.text)}`;
      log.appendChild(d);
      while (log.children.length > 9) log.removeChild(log.firstChild);
    }
  }

  mapInfo(sim) {
    let el = this.root.querySelector('.map-info');
    if (!el) { el = document.createElement('div'); el.className = 'map-info panel'; el.style.pointerEvents = 'none'; this.root.appendChild(el); }
    const t = sim.tel;
    el.innerHTML = `<h2>World tracking map</h2><div class="tel"><span>MET</span><span>${fmtTime(sim.t)}</span><span>ALT</span><span>${U.alt(t.alt)}</span><span>SPEED</span><span>${U.speed(t.speed)}</span><span>DOWNRANGE</span><span>${U.dist(t.downrange)}</span><span>APO / PERI</span><span>${t.el.apoapsis === Infinity ? '∞' : U.alt(t.el.apoapsis)} / ${U.alt(t.el.periapsis)}</span><span>INC</span><span>${t.el.inc.toFixed(1)}°</span></div><div class="muted" style="margin-top:6px">wheel: zoom · drag: pan · M: close</div>`;
    el.style.display = 'block';
    return el;
  }
  hideMapInfo() { const el = this.root.querySelector('.map-info'); if (el) el.style.display = 'none'; }

  // ---------------- results / pause ----------------
  results(result, sim, vehicle, mission, h) {
    const st = sim.stats, el = sim.tel.el;
    const s = this.screen('results', `
      <div class="dim"></div>
      <div class="results panel"><div class="row spread"><div><h2>${mission ? esc(mission.name) : 'Free flight'} — ${result.success ? '<span class="green">SUCCESS</span>' : '<span class="red">OBJECTIVES NOT MET</span>'}</h2><div class="muted">${esc(displayName(vehicle))} · ${sim.status.toUpperCase()}</div></div><div class="score">${result.score}<div class="muted" style="font-size:11px">SCORE</div></div></div>
        <div class="lines">${result.lines.map((l) => `<div class="${l.ok ? 'ok' : 'fail'}"><span>${esc(l.label)}</span><span>${esc(l.text)}</span></div>`).join('')}</div>
        <h3>Flight statistics</h3>
        <div class="kv"><span>Max altitude</span><span>${U.alt(st.maxAlt)}</span><span>Max speed</span><span>${U.speed(st.maxSpeed)}</span><span>Max-Q</span><span>${U.press(st.maxQ)} at ${fmtTime(st.maxQt)}</span><span>Max acceleration</span><span>${st.maxG.toFixed(2)} g</span><span>Δv expended</span><span>${(st.dvUsed / 1000).toFixed(2)} km/s</span><span>Final orbit</span><span>${el.apoapsis === Infinity ? '∞' : U.alt(el.apoapsis)} × ${U.alt(el.periapsis)}, ${el.inc.toFixed(1)}°</span><span>Downrange</span><span>${U.dist(sim.tel.downrange)}</span></div>
        <div class="row" style="margin-top:14px"><button class="primary" data-a="continue" ${sim.status === 'orbit' ? '' : 'disabled'}>Continue in orbit</button><button data-a="again">Fly again</button><button data-a="menu">Main menu</button></div>
      </div>`);
    this.on(s, '[data-a=continue]', 'click', h.cont);
    this.on(s, '[data-a=again]', 'click', h.again);
    this.on(s, '[data-a=menu]', 'click', h.menu);
    this.show('results');
  }

  // ---------------- scrub ----------------
  scrub(reason, h) {
    const s = this.screen('scrub', `
      <div class="topbar"><span class="ph">Scrub</span><span class="clock" id="sc-clock">00:00</span><span class="ph" id="sc-phase" style="color:var(--red)">SAFING</span></div>
      <div class="actions"><div class="panel"><h2>Scrub — ${esc(reason)}</h2>
        <div class="muted" id="sc-status">Safing the vehicle…</div>
        <div class="bar"><i id="sc-bar" style="width:0%"></i></div>
        <div class="muted" id="sc-mass"></div>
        <div class="row"><button class="go" data-a="recycle" id="sc-recycle" disabled>Recycle the count</button><button data-a="menu">Main menu</button></div></div></div>
      <div class="console" id="sc-log"></div>`);
    this.on(s, '[data-a=recycle]', 'click', h.recycle);
    this.on(s, '[data-a=menu]', 'click', h.menu);
    this._scLog = 0;
    this.show('scrub');
  }
  updateScrub(info) {
    const s = this.screens.scrub;
    if (!s) return;
    s.querySelector('#sc-clock').textContent = fmtTime(info.t, false);
    s.querySelector('#sc-phase').textContent = info.done ? 'SAFE' : info.safing ? 'PAD SAFING' : 'DETANKING';
    s.querySelector('#sc-phase').style.color = info.done ? 'var(--green)' : 'var(--red)';
    s.querySelector('#sc-status').textContent = info.done ? 'Vehicle safe. Propellant drained.' : info.safing ? 'Engine shutdown in progress…' : 'Draining propellant tanks…';
    s.querySelector('#sc-bar').style.width = `${(info.safing ? 0 : info.progress) * 100}%`;
    s.querySelector('#sc-mass').textContent = `${U.massT(info.loaded)} of ${U.massT(info.total)} still in the tanks`;
    s.querySelector('#sc-recycle').disabled = !info.done;
    this.appendLog(s.querySelector('#sc-log'), info.log, '_scLog');
  }

  pause(h) {
    const s = this.screen('pause', `<div class="dim"></div><div class="modal panel"><h2>Paused</h2><button class="primary" data-a="resume">Resume</button><button data-a="restart">Restart this launch</button><button data-a="results">Show results so far</button><button class="danger" data-a="menu">Abort to menu</button></div>`);
    this.on(s, 'button', 'click', (e) => h[e.currentTarget.dataset.a]());
    this.show('pause');
  }
}
