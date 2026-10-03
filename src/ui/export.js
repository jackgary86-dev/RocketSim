import * as U from './units.js';
import { fmtTime } from '../sim/math.js';

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const slug = (s) => String(s || 'flight').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;

/** Flight track (sampled every 2 s) plus the event log as a single CSV file. */
export function downloadTelemetryCsv(sim, vehicle) {
  const rows = ['t_s,lat_deg,lon_deg,alt_m,speed_ms'];
  for (const p of sim.track) rows.push([p.t, p.lat, p.lon, p.alt, p.speed].map((v) => +v.toFixed(3)).join(','));
  rows.push('', 'event_t_s,kind,text');
  for (const e of sim.events) rows.push([+e.t.toFixed(2), e.kind, csvCell(e.text)].join(','));
  download(new Blob([rows.join('\n')], { type: 'text/csv' }), `${slug(vehicle.name)}-telemetry.csv`);
}

/** Canvas-rendered summary card: vehicle, orbit, score and a ground-track thumbnail. */
export function downloadMissionCard(result, sim, vehicle, mission) {
  const W = 960, H = 540;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#0a1020'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#e8eefc'; g.font = 'bold 34px sans-serif';
  g.fillText(mission ? mission.name : 'Free flight', 30, 56);
  g.font = '20px sans-serif'; g.fillStyle = '#9fb0d0';
  g.fillText(`${vehicle.name} · ${sim.status.toUpperCase()}`, 30, 88);
  g.fillStyle = result.success ? '#5fe08a' : '#ff6b6b'; g.font = 'bold 22px sans-serif';
  g.fillText(result.success ? 'SUCCESS' : 'OBJECTIVES NOT MET', 30, 124);
  g.fillStyle = '#e8eefc'; g.font = 'bold 64px sans-serif'; g.textAlign = 'right';
  g.fillText(String(result.score), W - 30, 70);
  g.font = '14px sans-serif'; g.fillStyle = '#9fb0d0'; g.fillText('SCORE', W - 30, 92);
  g.textAlign = 'left';

  const st = sim.stats, el = sim.tel.el;
  const lines = [
    ['Orbit', `${el.apoapsis === Infinity ? '∞' : U.alt(el.apoapsis)} × ${U.alt(el.periapsis)}, ${el.inc.toFixed(1)}°`],
    ['Max altitude', U.alt(st.maxAlt)], ['Max speed', U.speed(st.maxSpeed)],
    ['Max-Q', `${U.press(st.maxQ)} at ${fmtTime(st.maxQt)}`], ['Max acceleration', `${st.maxG.toFixed(2)} g`],
    ['Δv expended', `${(st.dvUsed / 1000).toFixed(2)} km/s`], ['Downrange', U.dist(sim.tel.downrange)],
  ];
  lines.forEach(([k, v], i) => {
    g.font = '16px sans-serif'; g.fillStyle = '#9fb0d0'; g.fillText(k, 30, 170 + i * 30);
    g.fillStyle = '#e8eefc'; g.fillText(v, 190, 170 + i * 30);
  });

  // ground-track thumbnail (equirectangular)
  const mx = 30, my = 390, mw = 360, mh = 120;
  g.fillStyle = '#10213f'; g.fillRect(mx, my, mw, mh);
  g.strokeStyle = '#243a66'; g.lineWidth = 1;
  for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(mx + (mw * i) / 6, my); g.lineTo(mx + (mw * i) / 6, my + mh); g.stroke(); }
  for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(mx, my + (mh * i) / 3); g.lineTo(mx + mw, my + (mh * i) / 3); g.stroke(); }
  g.strokeStyle = '#ffb347'; g.lineWidth = 2; g.beginPath();
  let prevX = null;
  sim.track.forEach((p, i) => {
    const x = mx + ((p.lon + 180) / 360) * mw, y = my + ((90 - p.lat) / 180) * mh;
    if (i === 0 || (prevX !== null && Math.abs(x - prevX) > mw / 2)) g.moveTo(x, y); else g.lineTo(x, y);
    prevX = x;
  });
  g.stroke();

  // altitude/speed profile
  const px = 430, py = 390, pw = 500, ph = 120;
  g.fillStyle = '#10213f'; g.fillRect(px, py, pw, ph);
  const tr = sim.track;
  if (tr.length > 1) {
    const t0 = tr[0].t, t1 = tr[tr.length - 1].t || 1;
    const maxA = Math.max(...tr.map((p) => p.alt), 1);
    g.strokeStyle = '#6fb1ff'; g.beginPath();
    tr.forEach((p, i) => {
      const x = px + ((p.t - t0) / Math.max(1, t1 - t0)) * pw, y = py + ph - (p.alt / maxA) * ph;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.stroke();
  }
  g.fillStyle = '#9fb0d0'; g.font = '12px sans-serif';
  g.fillText('Ground track', mx, my - 6); g.fillText('Altitude profile', px, py - 6);
  g.fillText('RocketSim', W - 90, H - 14);
  c.toBlob((b) => b && download(b, `${slug(vehicle.name)}-mission-card.png`), 'image/png');
}
