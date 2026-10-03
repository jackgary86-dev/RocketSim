import { RE, DEG } from '../sim/math.js';
import * as U from '../ui/units.js';

/**
 * Large 2D equirectangular world map: ground track, predicted track, spent stages,
 * droneship landing, downrange rings. Zoom with the wheel, drag to pan.
 */
export class WorldMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.img = new Image();
    this.img.src = import.meta.env.BASE_URL + 'textures/earth_atmos_2048.jpg';
    this.zoom = 1;
    this.cx = 0.5; this.cy = 0.5;   // view centre in map fractions
    this.follow = true;
    this.drag = null;
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0012);
      this.zoom = Math.max(1, Math.min(24, this.zoom * f));
    }, { passive: false });
    canvas.addEventListener('mousedown', (e) => { this.drag = { x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy }; });
    window.addEventListener('mousemove', (e) => {
      if (!this.drag) return;
      const { W, H } = this.size();
      this.cx = this.drag.cx - (e.clientX - this.drag.x) / (W * this.zoom);
      this.cy = this.drag.cy - (e.clientY - this.drag.y) / (H * this.zoom);
      this.follow = false;
    });
    window.addEventListener('mouseup', () => { this.drag = null; });
  }

  size() {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    if (this.canvas.width !== W * devicePixelRatio || this.canvas.height !== H * devicePixelRatio) {
      this.canvas.width = W * devicePixelRatio; this.canvas.height = H * devicePixelRatio;
    }
    return { W, H };
  }

  // map fraction (0..1) of lon/lat
  frac(lon, lat) { return [(lon + 180) / 360, (90 - lat) / 180]; }
  // screen coordinates (map is drawn so that the whole world spans the canvas width at zoom 1)
  toScreen(lon, lat) {
    const { W, H } = this.size();
    const [fx, fy] = this.frac(lon, lat);
    const mapW = W * this.zoom, mapH = mapW / 2;
    const ox = W / 2 - this.cx * mapW, oy = H / 2 - this.cy * mapH;
    return [ox + fx * mapW, oy + fy * mapH];
  }

  drawPolyline(pts, style, width, dash) {
    const c = this.ctx;
    c.strokeStyle = style; c.lineWidth = width; c.setLineDash(dash || []);
    c.beginPath();
    let prev = null;
    for (const p of pts) {
      if (prev && Math.abs(p.lon - prev.lon) > 180) { c.stroke(); c.beginPath(); prev = null; }
      const [x, y] = this.toScreen(p.lon, p.lat);
      if (!prev) c.moveTo(x, y); else c.lineTo(x, y);
      prev = p;
    }
    c.stroke(); c.setLineDash([]);
  }

  ring(lat0, lon0, distM) {
    const ang = distM / RE;
    const pts = [];
    const la0 = lat0 * DEG, lo0 = lon0 * DEG;
    for (let i = 0; i <= 120; i++) {
      const b = (i / 120) * Math.PI * 2;
      const la = Math.asin(Math.sin(la0) * Math.cos(ang) + Math.cos(la0) * Math.sin(ang) * Math.cos(b));
      const lo = lo0 + Math.atan2(Math.sin(b) * Math.sin(ang) * Math.cos(la0), Math.cos(ang) - Math.sin(la0) * Math.sin(la));
      pts.push({ lat: la / DEG, lon: ((lo / DEG + 540) % 360) - 180 });
    }
    return pts;
  }

  marker(lon, lat, color, label, shape = 'dot', r = 5) {
    const c = this.ctx;
    const [x, y] = this.toScreen(lon, lat);
    c.fillStyle = color; c.strokeStyle = color; c.lineWidth = 2;
    c.beginPath();
    if (shape === 'dot') c.arc(x, y, r, 0, Math.PI * 2);
    else if (shape === 'x') { c.moveTo(x - r, y - r); c.lineTo(x + r, y + r); c.moveTo(x + r, y - r); c.lineTo(x - r, y + r); c.stroke(); }
    else if (shape === 'tri') { c.moveTo(x, y - r * 1.4); c.lineTo(x + r, y + r); c.lineTo(x - r, y + r); c.closePath(); }
    else if (shape === 'sq') c.rect(x - r, y - r, r * 2, r * 2);
    if (shape !== 'x') c.fill();
    if (label) {
      c.font = '12px ui-monospace, Consolas, monospace';
      c.fillStyle = color; c.shadowColor = '#000'; c.shadowBlur = 4;
      c.fillText(label, x + r + 4, y + 4);
      c.shadowBlur = 0;
    }
  }

  draw(data) {
    const { W, H } = this.size();
    const c = this.ctx;
    c.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    if (this.follow && data.pos) { const [fx, fy] = this.frac(data.pos.lon, data.pos.lat); this.cx = fx; this.cy = fy; }
    this.cy = Math.max(0, Math.min(1, this.cy));
    c.fillStyle = '#04070c'; c.fillRect(0, 0, W, H);
    const mapW = W * this.zoom, mapH = mapW / 2;
    const ox = W / 2 - this.cx * mapW, oy = H / 2 - this.cy * mapH;
    // draw the world (with wrap copies either side)
    for (const k of [-1, 0, 1]) {
      const x = ox + k * mapW;
      if (x > W || x + mapW < 0) continue;
      if (this.img.complete && this.img.naturalWidth) c.drawImage(this.img, x, oy, mapW, mapH);
      else { c.fillStyle = '#0d2a44'; c.fillRect(x, oy, mapW, mapH); }
    }
    c.fillStyle = 'rgba(2,6,12,0.18)'; c.fillRect(0, 0, W, H);
    // graticule
    c.strokeStyle = 'rgba(140,190,230,0.22)'; c.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 30) { const [x] = this.toScreen(lon, 0); c.beginPath(); c.moveTo(x, oy); c.lineTo(x, oy + mapH); c.stroke(); }
    for (let lat = -60; lat <= 60; lat += 30) { const [, y] = this.toScreen(0, lat); c.beginPath(); c.moveTo(ox, y); c.lineTo(ox + mapW, y); c.stroke(); }
    c.fillStyle = 'rgba(140,190,230,0.6)'; c.font = '11px ui-monospace, Consolas, monospace';
    for (let lon = -150; lon <= 150; lon += 30) { const [x, y] = this.toScreen(lon, 0); c.fillText(`${lon}°`, x + 3, y - 3); }

    const site = data.site;
    // downrange rings
    for (const d of [500e3, 1000e3, 2000e3, 4000e3]) this.drawPolyline(this.ring(site.lat, site.lon, d), 'rgba(255,255,255,0.16)', 1, [4, 6]);
    // predicted track
    if (data.predicted?.length) this.drawPolyline(data.predicted, 'rgba(80,220,255,0.75)', 1.5, [6, 5]);
    // flown track
    if (data.track?.length) this.drawPolyline(data.track, '#ffa040', 2.2);
    // debris / recovered stages
    for (const d of data.debris || []) {
      if (d.impact) this.marker(d.impact.lon, d.impact.lat, d.impact.landed ? '#3ddc84' : '#b0b6bd', `${d.name}${d.impact.landed ? ' — LANDED' : ''}`, d.impact.landed ? 'sq' : 'x', 5);
      else if (d.alive && d.pos) this.marker(d.pos.lon, d.pos.lat, d.kind === 'payload' ? '#ffd166' : '#d0d4d8', `${d.name} ${U.alt(d.pos.alt)}`, 'dot', 3.5);
    }
    this.marker(site.lon, site.lat, '#ffffff', site.short, 'tri', 6);
    if (data.pos) {
      const col = data.status === 'orbit' ? '#3ddc84' : data.status === 'crashed' || data.status === 'breakup' ? '#ff4d4d' : '#ffa040';
      const [x, y] = this.toScreen(data.pos.lon, data.pos.lat);
      c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 9 + 3 * Math.sin(performance.now() / 200), 0, Math.PI * 2); c.stroke();
      this.marker(data.pos.lon, data.pos.lat, col, `${data.label}  ${U.alt(data.pos.alt)}`, 'dot', 4);
    }
    // legend
    c.fillStyle = 'rgba(5,10,18,0.75)'; c.fillRect(W - 236, H - 92, 226, 82);
    c.font = '12px ui-monospace, Consolas, monospace';
    c.fillStyle = '#ffa040'; c.fillText('— ground track', W - 226, H - 72);
    c.fillStyle = '#50dcff'; c.fillText('- - predicted / orbit', W - 226, H - 54);
    c.fillStyle = '#3ddc84'; c.fillText('■ landed   ', W - 226, H - 36);
    c.fillStyle = '#b0b6bd'; c.fillText('× splashdown   ○ rings 500/1k/2k/4k km', W - 226, H - 18);
  }
}
