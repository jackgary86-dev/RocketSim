import * as THREE from 'three';
import { PROPELLANTS } from '../data/config.js';
import { displayMaker } from '../data/names.js';

// ---------- materials & textures ----------
function bodyTexture(color, accent, { stripes = false, text = '', band = true } = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 512, 1024);
  g.strokeStyle = 'rgba(0,0,0,0.10)'; g.lineWidth = 2;
  for (let y = 96; y < 1024; y += 160) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  for (let x = 64; x < 512; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 1024); g.stroke(); }
  if (stripes) {
    g.fillStyle = accent;
    g.fillRect(0, 620, 128, 404); g.fillRect(256, 620, 128, 404);
    g.fillRect(0, 0, 128, 120); g.fillRect(256, 0, 128, 120);
  }
  if (band) { g.fillStyle = accent; g.fillRect(0, 0, 512, 28); g.fillRect(0, 996, 512, 28); }
  if (text) {
    g.save(); g.translate(420, 520); g.rotate(-Math.PI / 2);
    g.fillStyle = accent; g.font = 'bold 54px Arial, sans-serif'; g.textAlign = 'center'; g.fillText(text, 0, 0);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const metal = (color) => new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.45 });
const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f33, metalness: 0.8, roughness: 0.5 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.3, roughness: 0.8 });
const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.3 });
const panelMat = new THREE.MeshStandardMaterial({ color: 0x1b2a6b, metalness: 0.4, roughness: 0.4, emissive: 0x0a1030 });

function spriteTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.5, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
export const SOFT_SPRITE = spriteTexture();

export function enginePositions(n, D) {
  const ring = (k, r, off = 0) => Array.from({ length: k }, (_, i) => { const a = off + (i / k) * Math.PI * 2; return [Math.cos(a) * r, Math.sin(a) * r]; });
  if (n === 1) return [[0, 0]];
  if (n === 2) return ring(2, 0.22 * D);
  if (n === 3) return ring(3, 0.25 * D);
  if (n === 4) return ring(4, 0.3 * D, Math.PI / 4);
  if (n === 5) return [[0, 0], ...ring(4, 0.32 * D, Math.PI / 4)];
  if (n === 6) return ring(6, 0.34 * D);
  if (n === 7) return [[0, 0], ...ring(6, 0.33 * D)];
  if (n === 9) return [[0, 0], ...ring(8, 0.36 * D)];
  if (n === 33) return [...ring(3, 0.1 * D), ...ring(10, 0.25 * D), ...ring(20, 0.4 * D)];
  const inner = Math.max(1, Math.round(n / 3));
  return [...ring(inner, 0.18 * D), ...ring(n - inner, 0.38 * D)];
}

function ogiveGeometry(r, h, segments = 24, phiStart = 0, phiLength = Math.PI * 2) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector2(r * Math.sqrt(1 - t * t * t * 0.999) * (1 - t * 0.02), h * t));
  }
  pts.push(new THREE.Vector2(0, h));
  return new THREE.LatheGeometry(pts, segments, phiStart, phiLength);
}

function makePlume(color, core, r, len) {
  const g = new THREE.Group();
  const geo = new THREE.ConeGeometry(1, 1, 14, 1, true);
  geo.rotateX(Math.PI); geo.translate(0, -0.5, 0);
  const outer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  const inner = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: core, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  outer.scale.set(r, len, r);
  inner.scale.set(r * 0.45, len * 0.6, r * 0.45);
  g.add(outer, inner);
  g.userData = { r, len, outer, inner };
  g.visible = false;
  return g;
}

/**
 * Procedural 3D model of a configured vehicle. The group's origin is the base of
 * the active stage; stages, boosters, fairing halves and payload can be detached
 * as independent groups for separation animation.
 */
export class RocketModel {
  constructor(vehicle) {
    this.v = vehicle;
    this.group = new THREE.Group();
    this.stack = new THREE.Group();
    this.group.add(this.stack);
    this.stageGroups = [];
    this.stageBodies = [];
    this.stageEngines = [];
    this.boosterGroups = [];
    this.plumeSets = { stage: [], booster: [] };
    this.lights = [];
    this.stageBase = [];
    this.stageLen = [];
    this.vents = [];
    this.activeStage = 0;
    this.build();
  }

  build() {
    const v = this.v;
    const D = v.diameter;
    const H = v.height;
    const { body, accent } = v.colors;
    const noseLen = v.nose === 'fairing' ? Math.min(2.4 * D, H * 0.28) : v.nose === 'capsule' ? Math.min(2.2 * D, H * 0.2) : v.nose === 'ship' ? 1.6 * D : 1.3 * D;
    const avail = H - noseLen;
    const vols = v.stages.map((s) => s.prop / PROPELLANTS[s.fuel].bulk + s.dry * 0.3 / 1000);
    const sumV = vols.reduce((a, b) => a + b, 0);
    let y = 0;
    v.stages.forEach((s, i) => {
      const len = Math.max(avail * 0.08, avail * (vols[i] / sumV));
      this.stageBase.push(y); this.stageLen.push(len);
      y += len;
    });
    this.height = H;

    // stages
    v.stages.forEach((s, i) => {
      const d = s.d || D;
      const g = new THREE.Group();
      g.position.y = this.stageBase[i];
      const len = this.stageLen[i];
      const isSaturnS1 = v.id === 'saturnv' && i === 0;
      const tex = bodyTexture(s.color || body, accent, { stripes: isSaturnS1, text: i === 0 && v.nose !== 'shuttle' ? (displayMaker(v).split(' ')[0].toUpperCase()) : '' });
      const mat = new THREE.MeshStandardMaterial({ map: tex, metalness: v.id === 'starship' ? 0.85 : 0.15, roughness: v.id === 'starship' ? 0.35 : 0.6 });
      const bodyG = new THREE.Group();
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(d / 2, d / 2, len, 40, 1), mat);
      cyl.position.y = len / 2;
      bodyG.add(cyl);
      // interstage adapter to the next (narrower) stage
      const next = v.stages[i + 1];
      if (next) {
        const dn = next.d || D;
        if (dn < d - 0.05) {
          const ad = new THREE.Mesh(new THREE.CylinderGeometry(dn / 2, d / 2, Math.min(3, d), 32, 1), darkMat);
          ad.position.y = len + Math.min(3, d) / 2;
          bodyG.add(ad);
        }
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(d / 2 + 0.02, d / 2 + 0.02, 0.6, 40, 1), darkMat);
        ring.position.y = len - 0.3;
        bodyG.add(ring);
      }
      // Proton-style external tanks
      if (s.pods) {
        for (let k = 0; k < s.pods.count; k++) {
          const a = (k / s.pods.count) * Math.PI * 2;
          const pod = new THREE.Mesh(new THREE.CylinderGeometry(s.pods.d / 2, s.pods.d / 2, len * s.pods.frac, 20, 1), mat);
          pod.position.set(Math.cos(a) * (d / 2 + s.pods.d / 2 - 0.1), len * s.pods.frac / 2, Math.sin(a) * (d / 2 + s.pods.d / 2 - 0.1));
          bodyG.add(pod);
        }
      }
      g.add(bodyG);
      this.stageBodies.push(bodyG);

      // engines
      const engG = new THREE.Group();
      const E = Math.min(d * 0.55, 6);
      const rn = (0.42 * d) / (1 + Math.sqrt(s.engines)) * 1.25;
      const P = PROPELLANTS[s.fuel];
      const plumes = [];
      for (const [px, pz] of enginePositions(s.engines, d)) {
        const noz = new THREE.Mesh(new THREE.CylinderGeometry(rn * 0.45, rn, E, 18, 1, true), nozzleMat);
        noz.position.set(px, -E / 2, pz);
        engG.add(noz);
        const ch = new THREE.Mesh(new THREE.CylinderGeometry(rn * 0.5, rn * 0.5, E * 0.3, 12), darkMat);
        ch.position.set(px, E * 0.1, pz);
        engG.add(ch);
        const pl = makePlume(P.plume, P.plumeCore, rn * 1.15, E * 7 + d * 3);
        pl.position.set(px, -E, pz);
        engG.add(pl);
        plumes.push(pl);
      }
      const light = new THREE.PointLight(P.plume, 0, Math.max(60, d * 25), 1.5);
      light.position.y = -E * 2;
      engG.add(light);
      this.lights.push(light);
      g.add(engG);
      this.stageEngines.push(engG);
      this.plumeSets.stage.push(plumes);
      this.stageGroups.push(g);
      this.stack.add(g);

      // fins / grid fins on the first stage
      if (i === 0 && v.nose !== 'shuttle') {
        const fins = v.config?.controlFins ?? 'aero';
        if (fins === 'aero' || v.fins) this.addFins(bodyG, d, len);
        if (fins === 'grid' || v.gridFins) this.addGridFins(bodyG, d, len);
      }
      if (s.fuel !== 'solid') {
        const vent = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT_SPRITE, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
        vent.position.set(d / 2, len * 0.92, 0);
        vent.scale.set(d * 1.5, d * 1.5, 1);
        bodyG.add(vent);
        this.vents.push(vent);
      }
    });

    // boosters
    const d0 = v.stages[0].d || D;
    v.boosters.forEach((b, j) => {
      const groups = [];
      const plumes = [];
      const P = PROPELLANTS[b.fuel];
      const tex = bodyTexture(b.color || body, accent, { band: true });
      const mat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.15, roughness: 0.6 });
      const totalAround = v.boosters.reduce((n, x) => n + x.count, 0);
      let slot = v.boosters.slice(0, j).reduce((n, x) => n + x.count, 0);
      for (let k = 0; k < b.count; k++) {
        const g = new THREE.Group();
        const a = ((slot++) / totalAround) * Math.PI * 2 + (v.nose === 'shuttle' ? Math.PI / 2 : Math.PI / 4);
        const rad = d0 / 2 + b.d / 2 + 0.05;
        g.position.set(Math.cos(a) * rad, -0.5, Math.sin(a) * rad);
        const bodyLen = b.len;
        if (b.shape === 'cone') {
          const m = new THREE.Mesh(new THREE.CylinderGeometry(b.d * 0.42, b.d / 2, bodyLen, 28, 1), mat);
          m.position.y = bodyLen / 2; g.add(m);
          const tip = new THREE.Mesh(new THREE.ConeGeometry(b.d * 0.42, b.d * 0.9, 28), mat);
          tip.position.y = bodyLen + b.d * 0.45; g.add(tip);
        } else {
          const m = new THREE.Mesh(new THREE.CylinderGeometry(b.d / 2, b.d / 2, bodyLen, 28, 1), mat);
          m.position.y = bodyLen / 2; g.add(m);
          const tip = new THREE.Mesh(ogiveGeometry(b.d / 2, b.d * 1.6, 28), mat);
          tip.position.y = bodyLen; g.add(tip);
        }
        const E = Math.min(b.d * 0.5, 4.5);
        const n = b.engines || 1;
        const rn = (0.42 * b.d) / (1 + Math.sqrt(n)) * 1.25;
        for (const [px, pz] of enginePositions(n, b.d)) {
          const noz = new THREE.Mesh(new THREE.CylinderGeometry(rn * 0.45, rn, E, 16, 1, true), nozzleMat);
          noz.position.set(px, -E / 2, pz); g.add(noz);
          const pl = makePlume(P.plume, P.plumeCore, rn * 1.15, E * 7 + b.d * 3);
          pl.position.set(px, -E, pz); g.add(pl);
          plumes.push(pl);
        }
        // attachment struts
        const strut = new THREE.Mesh(new THREE.BoxGeometry(rad - d0 / 2 + 0.4, 0.5, 0.5), darkMat);
        strut.position.set(-(rad - d0 / 2) / 2, bodyLen * 0.85, 0);
        strut.lookAt(new THREE.Vector3(-Math.cos(a), bodyLen * 0.85, -Math.sin(a)).add(strut.position));
        g.add(strut);
        this.stack.add(g);
        groups.push(g);
      }
      this.boosterGroups.push(groups);
      this.plumeSets.booster.push(plumes);
    });

    // nose section
    this.buildNose(noseLen);

    // Shuttle orbiter rides on the side of the tank
    if (v.nose === 'shuttle') this.buildOrbiter();
  }

  addFins(bodyG, d, len) {
    const shape = new THREE.Shape();
    const w = d * 0.55, h = d * 1.1;
    shape.moveTo(0, 0); shape.lineTo(w, 0); shape.lineTo(w, h * 0.35); shape.lineTo(0, h); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.08, d * 0.03), bevelEnabled: false });
    for (let k = 0; k < 4; k++) {
      const fin = new THREE.Mesh(geo, metal(this.v.colors.accent));
      const a = (k / 4) * Math.PI * 2;
      fin.position.set(Math.cos(a) * (d / 2 - 0.02), 0.3, Math.sin(a) * (d / 2 - 0.02));
      fin.rotation.y = -a;
      bodyG.add(fin);
    }
  }

  addGridFins(bodyG, d, len) {
    const w = d * 0.4, h = d * 0.08, t = d * 0.5;
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(w, t, h), darkMat);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(fin.geometry), new THREE.LineBasicMaterial({ color: 0x9a9a9a }));
      fin.add(edges);
      fin.position.set(Math.cos(a) * (d / 2 + w / 2 - 0.05), len * 0.94, Math.sin(a) * (d / 2 + w / 2 - 0.05));
      fin.rotation.y = -a;
      bodyG.add(fin);
    }
  }

  buildNose(noseLen) {
    const v = this.v;
    const top = this.stageBase[this.stageBase.length - 1] + this.stageLen[this.stageLen.length - 1];
    const lastD = v.stages[v.stages.length - 1].d || v.diameter;
    const D = v.nose === 'fairing' ? Math.max(lastD, v.diameter) : lastD;
    const nose = new THREE.Group();
    nose.position.y = top;
    this.noseGroup = nose;
    this.fairingHalves = [];
    const white = new THREE.MeshStandardMaterial({ color: v.nose === 'ship' ? v.colors.body : 0xf4f4f2, metalness: v.nose === 'ship' ? 0.85 : 0.1, roughness: v.nose === 'ship' ? 0.35 : 0.6 });

    if (v.nose === 'fairing') {
      const cylLen = noseLen * 0.55, coneLen = noseLen * 0.45;
      for (let h = 0; h < 2; h++) {
        const half = new THREE.Group();
        const phi = h * Math.PI;
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(D / 2, D / 2, cylLen, 24, 1, true, phi, Math.PI), white);
        cyl.position.y = cylLen / 2;
        const cone = new THREE.Mesh(ogiveGeometry(D / 2, coneLen, 24, phi, Math.PI), white);
        cone.position.y = cylLen;
        if (D > lastD + 0.05) {
          const adapter = new THREE.Mesh(new THREE.CylinderGeometry(D / 2, lastD / 2, Math.min(2.5, D * 0.6), 24, 1, true, phi, Math.PI), white);
          adapter.position.y = -Math.min(2.5, D * 0.6) / 2 + 0.01;
          half.add(adapter);
        }
        half.add(cyl, cone);
        nose.add(half);
        this.fairingHalves.push(half);
      }
      this.payloadMesh = this.makeSatellite(Math.min(D * 0.45, 3));
      this.payloadMesh.position.y = noseLen * 0.15;
      nose.add(this.payloadMesh);
    } else if (v.nose === 'capsule') {
      const smLen = noseLen * 0.4, capLen = noseLen * 0.3, towerLen = noseLen * 0.3;
      const sm = new THREE.Mesh(new THREE.CylinderGeometry(D * 0.3, D * 0.5, smLen, 28, 1), white);
      sm.position.y = smLen / 2; nose.add(sm);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(D * 0.08, D * 0.3, capLen, 28, 1), metal(0xbfc3c7));
      cap.position.y = smLen + capLen / 2; nose.add(cap);
      const tower = new THREE.Group();
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(D * 0.03, D * 0.03, towerLen * 0.7, 8), darkMat);
      mast.position.y = towerLen * 0.35;
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(D * 0.05, D * 0.07, towerLen * 0.3, 10), white);
      motor.position.y = towerLen * 0.85;
      tower.add(mast, motor);
      tower.position.y = smLen + capLen;
      nose.add(tower);
      this.fairingHalves.push(tower);
      this.payloadMesh = null;
    } else if (v.nose === 'ship') {
      const cone = new THREE.Mesh(ogiveGeometry(D / 2, noseLen, 32), white);
      nose.add(cone);
      for (let k = 0; k < 2; k++) {
        const flap = new THREE.Mesh(new THREE.BoxGeometry(D * 0.35, noseLen * 0.5, D * 0.08), metal(0x2b2e33));
        flap.position.set((k ? -1 : 1) * (D / 2 + D * 0.12), noseLen * 0.25, 0);
        nose.add(flap);
      }
    } else if (v.nose === 'shuttle') {
      const cone = new THREE.Mesh(ogiveGeometry(D / 2, noseLen, 32), new THREE.MeshStandardMaterial({ color: v.colors.body, roughness: 0.8 }));
      nose.add(cone);
    }
    this.stack.add(nose);
  }

  buildOrbiter() {
    const v = this.v;
    const D = v.diameter;
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.6 });
    const black = new THREE.MeshStandardMaterial({ color: 0x25272a, roughness: 0.8 });
    const L = 37, fd = 4.6;
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(fd / 2, fd / 2, L, 24, 1), white);
    fus.position.y = L / 2; g.add(fus);
    const noseM = new THREE.Mesh(ogiveGeometry(fd / 2, 6, 24), black);
    noseM.position.y = L; g.add(noseM);
    // The orbiter rides belly-in against the tank: belly toward -X, payload bay / tail toward +X,
    // wings spread along +/-Z, nose up.
    const bay = new THREE.Mesh(new THREE.BoxGeometry(fd * 0.55, L * 0.55, fd * 0.8), white);
    bay.position.set(fd * 0.3, L * 0.5, 0); g.add(bay);
    const wing = new THREE.Shape();
    wing.moveTo(0, 0); wing.lineTo(12, 0); wing.lineTo(12, 4); wing.lineTo(1.5, 20); wing.lineTo(0, 20); wing.closePath();
    const wgeo = new THREE.ExtrudeGeometry(wing, { depth: 0.5, bevelEnabled: false });
    for (const s of [1, -1]) {
      const w = new THREE.Mesh(wgeo, black);
      w.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;   // span along +/-Z, thin along X
      w.position.set(-fd * 0.45, 1.5, 0);
      g.add(w);
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(7, 8, 0.5), white);
    tail.position.set(fd / 2 + 2.2, 4.5, 0); g.add(tail);
    const E = 3;
    for (const [px, pz] of enginePositions(3, fd)) {
      const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.2, E, 16, 1, true), nozzleMat);
      noz.position.set(px, -E / 2, pz); g.add(noz);
    }
    g.position.set(D / 2 + fd / 2 + 0.3, 4, 0);
    this.stageBodies[0].add(g);
    this.orbiter = g;
  }

  makeSatellite(size) {
    const g = new THREE.Group();
    const bus = new THREE.Mesh(new THREE.BoxGeometry(size, size * 1.2, size), goldMat);
    g.add(bus);
    for (const s of [1, -1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(size * 1.8, size * 0.9, 0.05), panelMat);
      panel.position.set(s * (size * 0.5 + size * 0.9), 0, 0);
      g.add(panel);
    }
    const dish = new THREE.Mesh(new THREE.SphereGeometry(size * 0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal(0xdddddd));
    dish.position.y = size * 0.7; dish.rotation.x = Math.PI;
    g.add(dish);
    g.userData.size = size;
    return g;
  }

  // ---------- assembly (shipping slideshow) ----------
  setAssembly(keys) {
    const has = (k) => keys === null || keys.has(k);
    this.stageBodies.forEach((b, i) => { b.visible = has(`stage:${i}`); });
    this.stageEngines.forEach((e, i) => { e.visible = has(`engine:${i}`) && has(`stage:${i}`); });
    this.boosterGroups.forEach((gs, j) => gs.forEach((g, k) => { g.visible = has(`booster:${j}:${k}`); }));
    this.noseGroup.visible = has('nose');
    if (this.payloadMesh) this.payloadMesh.visible = has('payload');
  }

  // ---------- animation ----------
  setStageThrust(i, throttle, pr, time) {
    const plumes = this.plumeSets.stage[i];
    const light = this.lights[i];
    this.animatePlumes(plumes, throttle, pr, time);
    if (light) light.intensity = throttle > 0.02 ? 3 + throttle * 6 : 0;
  }
  setBoosterThrust(j, throttle, pr, time) { this.animatePlumes(this.plumeSets.booster[j], throttle, pr, time); }
  animatePlumes(plumes, throttle, pr, time) {
    if (!plumes) return;
    const vac = 1 - Math.max(0, Math.min(1, pr));
    for (let k = 0; k < plumes.length; k++) {
      const pl = plumes[k];
      if (throttle < 0.02) { pl.visible = false; continue; }
      pl.visible = true;
      const f = 0.9 + 0.2 * Math.sin(time * 37 + k * 1.7) * Math.sin(time * 23 + k);
      const len = (0.55 + throttle * 0.55) * (1 + 2.8 * vac) * f;
      const wid = (0.8 + 0.3 * throttle) * (1 + 2.2 * vac) * (0.95 + 0.1 * Math.sin(time * 41 + k));
      pl.scale.set(wid, len, wid);
      pl.userData.outer.material.opacity = 0.35 + 0.3 * throttle * (1 - 0.5 * vac);
      pl.userData.inner.material.opacity = 0.6 + 0.3 * throttle;
    }
  }
  setVent(level, time) {
    this.vents.forEach((s, i) => {
      s.material.opacity = level * (0.35 + 0.15 * Math.sin(time * 3 + i));
      const d = this.v.diameter;
      s.scale.set(d * (1.2 + 0.6 * level), d * (1.2 + 0.6 * level), 1);
      s.position.x = this.v.diameter / 2 + level * 2 + Math.sin(time * 1.5 + i) * 0.5;
    });
  }

  setActiveStage(i) {
    this.activeStage = i;
    this.stack.position.y = -this.stageBase[i];
  }
  currentHeight() { return this.height - this.stageBase[this.activeStage]; }

  // ---------- separation ----------
  detachStage(i) {
    const g = this.stageGroups[i];
    this.stack.remove(g);
    this.plumeSets.stage[i].forEach((p) => { p.visible = false; });
    if (this.lights[i]) this.lights[i].intensity = 0;
    return g;
  }
  detachBoosters(j) {
    const gs = this.boosterGroups[j];
    gs.forEach((g) => this.stack.remove(g));
    this.plumeSets.booster[j].forEach((p) => { p.visible = false; });
    return gs;
  }
  detachFairing() {
    const halves = this.fairingHalves;
    halves.forEach((h) => this.noseGroup.remove(h));
    this.fairingHalves = [];
    return halves;
  }
  detachPayload() {
    let m = this.payloadMesh;
    if (!m) m = this.makeSatellite(Math.min(this.v.diameter * 0.4, 3));
    else this.noseGroup.remove(m);
    this.payloadMesh = null;
    return m;
  }
}
