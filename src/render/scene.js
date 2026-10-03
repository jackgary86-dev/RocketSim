import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RE, OMEGA, latLonToUnit, cross, norm, dot, sub, scale, len, clamp, lerp } from '../sim/math.js';
import { LAUNCH_SITE, rotY } from '../sim/flight.js';
import { RocketModel, SOFT_SPRITE } from './rocketMesh.js';

const GROUND_Y = -8; // launch mount height: vehicle base sits 8 m above grade

/**
 * three.js view. Render space is the pad-local east/up/south frame with a floating
 * origin at the vehicle, so the 70 m rocket and the 6,371 km Earth share one scene
 * without precision jitter.
 */
export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 8e7);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.rocketGroup = new THREE.Group();
    this.scene.add(this.rocketGroup);
    this.time = 0;
    this.cameraMode = 'chase';
    this.camPos = new THREE.Vector3(0, 30, 200);
    this.camTarget = new THREE.Vector3();
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.debris = [];
    this.sim = null;
    this.setupFrame(LAUNCH_SITE);
    this.buildLights();
    this.buildEarth();
    this.buildPad();
    this.buildStars();
    this.buildSmoke();
    this.buildTrail();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ---------- frames ----------
  setupFrame(site) {
    this.up0 = latLonToUnit(site.lat, site.lon);
    this.east0 = norm(cross([0, 1, 0], this.up0));
    this.north0 = cross(this.up0, this.east0);
  }
  frameAt(t) {
    const a = OMEGA * t;
    return { e: rotY(this.east0, a), u: rotY(this.up0, a), n: rotY(this.north0, a), pad: scale(rotY(this.up0, a), RE) };
  }
  toLocal(r, t, out = new THREE.Vector3()) {
    const f = this.frameAt(t);
    const rel = sub(r, f.pad);
    return out.set(dot(rel, f.e), dot(rel, f.u), -dot(rel, f.n));
  }
  dirToLocal(d, t, out = new THREE.Vector3()) {
    const f = this.frameAt(t);
    return out.set(dot(d, f.e), dot(d, f.u), -dot(d, f.n)).normalize();
  }

  // ---------- scene construction ----------
  buildLights() {
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    this.sun.position.set(0.45, 0.55, -0.7).multiplyScalar(1e5);
    this.scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0xbcd7ff, 0x4f4538, 0.7);
    this.scene.add(this.hemi);
  }

  buildEarth() {
    const loader = new THREE.TextureLoader();
    const tex = (p) => { const t = loader.load(p); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
    this.earthMat = new THREE.MeshStandardMaterial({ map: tex(import.meta.env.BASE_URL + 'textures/earth_atmos_2048.jpg'), roughness: 0.9, metalness: 0, emissiveMap: tex(import.meta.env.BASE_URL + 'textures/earth_lights_2048.png'), emissive: new THREE.Color(0xffe6b0), emissiveIntensity: 0.22 });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(RE, 192, 128), this.earthMat);
    this.padGroup = new THREE.Group();
    this.padGroup.position.y = GROUND_Y;
    this.world.add(this.padGroup);
    // Earth-fixed -> pad-local rotation (rows: east, up, south)
    const e = this.east0, u = this.up0, n = this.north0;
    const m = new THREE.Matrix4().set(e[0], e[1], e[2], 0, u[0], u[1], u[2], 0, -n[0], -n[1], -n[2], 0, 0, 0, 0, 1);
    this.earth.quaternion.setFromRotationMatrix(m);
    this.earth.position.y = -RE;
    this.padGroup.add(this.earth);

    const clouds = new THREE.Mesh(new THREE.SphereGeometry(RE * 1.0045, 128, 96), new THREE.MeshStandardMaterial({ map: tex(import.meta.env.BASE_URL + 'textures/earth_clouds_1024.png'), transparent: true, opacity: 0.85, depthWrite: false, roughness: 1 }));
    clouds.quaternion.copy(this.earth.quaternion);
    clouds.position.y = -RE;
    this.padGroup.add(clouds);
    this.clouds = clouds;

    const atmo = new THREE.Mesh(new THREE.SphereGeometry(RE * 1.035, 96, 64), new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: this.sun.position.clone().normalize() } },
      vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix*normal); vec4 p = modelViewMatrix*vec4(position,1.0); vP = p.xyz; gl_Position = projectionMatrix*p; }`,
      fragmentShader: `uniform vec3 sunDir; varying vec3 vN; varying vec3 vP; void main(){ vec3 v = normalize(-vP); float f = pow(1.0 - abs(dot(vN, v)), 2.6); vec3 sd = normalize((viewMatrix*vec4(sunDir,0.0)).xyz); float day = clamp(dot(vN, sd)*1.4+0.35, 0.0, 1.0); gl_FragColor = vec4(vec3(0.42,0.66,1.0)*f*day*1.6, f*0.9*day); }`,
      transparent: true, side: THREE.FrontSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    atmo.position.y = -RE;
    this.padGroup.add(atmo);
    this.atmo = atmo;
  }

  groundTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const g = c.getContext('2d');
    g.fillStyle = '#4a6b3a'; g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${40 + Math.random() * 60},${70 + Math.random() * 60},${30 + Math.random() * 30},0.35)`;
      g.fillRect(Math.random() * 1024, Math.random() * 1024, 2 + Math.random() * 6, 2 + Math.random() * 6);
    }
    // Atlantic east of the pad, Banana River to the west (12 km disc, 1024 px)
    g.fillStyle = '#1c4e78'; g.fillRect(512 + 0.11 * 512, 0, 512, 1024);
    g.fillStyle = '#2a5a80'; g.fillRect(0, 0, 512 - 0.3 * 512, 1024);
    g.fillStyle = '#d9d2b8'; g.fillRect(512 + 0.1 * 512, 0, 8, 1024);
    g.fillStyle = '#8c8c86'; g.fillRect(512 - 30, 0, 14, 1024); g.fillRect(0, 512 + 60, 1024, 10);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  buildPad() {
    const P = this.padGroup;
    const grey = new THREE.MeshStandardMaterial({ color: 0x8c8d88, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3b3d40, roughness: 0.9 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x6d7378, metalness: 0.6, roughness: 0.5 });
    const white = new THREE.MeshStandardMaterial({ color: 0xe6e6e2, roughness: 0.7 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(12000, 96), new THREE.MeshStandardMaterial({ map: this.groundTexture(), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = 0.4; P.add(ground);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(160, 1.6, 160), grey); slab.position.y = 0.8; P.add(slab);
    const trench = new THREE.Mesh(new THREE.BoxGeometry(26, 1.8, 170), dark); trench.position.set(0, 0.9, 0); P.add(trench);
    this.mount = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 20), steel); this.mount.position.y = 4; P.add(this.mount);
    for (const [x, z] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) { const post = new THREE.Mesh(new THREE.BoxGeometry(2, 9, 2), dark); post.position.set(x, 4.5, z); P.add(post); }

    this.tower = new THREE.Group(); P.add(this.tower);
    this.lightningMasts = [];
    for (const [x, z] of [[-190, -190], [190, -190], [-190, 190], [190, 190]]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2, 150, 10), white); m.position.set(x, 75, z); P.add(m); this.lightningMasts.push(m);
    }
    const wt = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 70, 16), white); wt.position.set(-220, 35, 140); P.add(wt);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(14, 24, 16), white); ball.position.set(-220, 80, 140); P.add(ball);
    const crawlerway = new THREE.Mesh(new THREE.BoxGeometry(56, 0.5, 780), new THREE.MeshStandardMaterial({ color: 0x6b6358, roughness: 1 })); crawlerway.position.set(0, 0.5, 380); P.add(crawlerway);
    const hif = new THREE.Mesh(new THREE.BoxGeometry(80, 26, 120), new THREE.MeshStandardMaterial({ color: 0xa3a7ab, roughness: 0.8 })); hif.position.set(0, 13, 800); P.add(hif);
    const hifRoof = new THREE.Mesh(new THREE.BoxGeometry(82, 1, 122), dark); hifRoof.position.set(0, 26.5, 800); P.add(hifRoof);
    const vab = new THREE.Mesh(new THREE.BoxGeometry(160, 160, 220), new THREE.MeshStandardMaterial({ color: 0xc9c9c6, roughness: 0.85 })); vab.position.set(-3600, 80, 2800); P.add(vab);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(60, 32), new THREE.MeshStandardMaterial({ color: 0xb03030, side: THREE.DoubleSide })); flag.position.set(-3519, 100, 2800); flag.rotation.y = Math.PI / 2; P.add(flag);
    for (let i = 0; i < 60; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(20 + Math.random() * 40, 6 + Math.random() * 12, 20 + Math.random() * 40), new THREE.MeshStandardMaterial({ color: 0x9c9a95, roughness: 0.9 }));
      b.position.set(-2800 - Math.random() * 1500, b.geometry.parameters.height / 2, 1800 + Math.random() * 2200);
      P.add(b);
    }
    this.transporter = new THREE.Mesh(new THREE.BoxGeometry(60, 3, 14), dark);
    this.transporter.visible = false; P.add(this.transporter);
    this.padLights = [];
  }

  buildTowerFor(vehicle) {
    this.tower.clear();
    const H = vehicle.height, D = vehicle.diameter;
    const steel = new THREE.MeshStandardMaterial({ color: 0x5f666c, metalness: 0.6, roughness: 0.5 });
    const x = -(D / 2 + 11);
    const core = new THREE.Mesh(new THREE.BoxGeometry(10, H * 1.12, 10), steel);
    core.position.set(x, H * 0.56, 0);
    core.add(new THREE.LineSegments(new THREE.EdgesGeometry(core.geometry), new THREE.LineBasicMaterial({ color: 0x1d2024 })));
    this.tower.add(core);
    for (let y = 12; y < H * 1.12; y += 12) {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(14, 0.6, 14), steel);
      deck.position.set(x, y, 0);
      this.tower.add(deck);
    }
    const arms = Math.max(2, Math.round(H / 25));
    this.arms = [];
    for (let i = 0; i < arms; i++) {
      const y = H * (0.25 + 0.65 * (i / Math.max(1, arms - 1)));
      const arm = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x) - D / 2 + 2, 1.4, 2.2), steel);
      arm.position.set(x / 2 - D / 4 + 1, y + 8, 0);
      this.tower.add(arm); this.arms.push(arm);
    }
    const crane = new THREE.Mesh(new THREE.BoxGeometry(40, 2, 2), steel);
    crane.position.set(x + 10, H * 1.12 + 6, 0); this.tower.add(crane);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, H * 0.3, 8), steel);
    mast.position.set(x, H * 1.12 + H * 0.15, 0); this.tower.add(mast);
  }

  buildStars() {
    const n = 4000;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 3e7;
      const s = Math.sqrt(1 - u * u);
      pos[i * 3] = r * s * Math.cos(th); pos[i * 3 + 1] = r * u; pos[i * 3 + 2] = r * s * Math.sin(th);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.scene.add(this.stars);
  }

  buildSmoke() {
    this.smoke = [];
    const mat = new THREE.SpriteMaterial({ map: SOFT_SPRITE, color: 0xd8d4cc, transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < 160; i++) {
      const s = new THREE.Sprite(mat.clone());
      s.visible = false;
      this.padGroup.add(s);
      this.smoke.push({ s, life: 0, vel: new THREE.Vector3() });
    }
  }

  buildTrail() {
    this.trailMax = 30000;
    const pos = new Float32Array(this.trailMax * 3);
    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.trailGeo.setDrawRange(0, 0);
    this.trail = new THREE.Line(this.trailGeo, new THREE.LineBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, fog: false }));
    this.trail.frustumCulled = false;
    this.world.add(this.trail);
    this.trailCount = 0;
    this.trailLastT = -1e9;
  }

  // ---------- vehicle ----------
  setVehicle(vehicle) {
    if (this.model) this.rocketGroup.remove(this.model.group);
    for (const d of this.debris) d.groups.forEach((g) => this.world.remove(g));
    this.debris = [];
    this.model = new RocketModel(vehicle);
    this.rocketGroup.add(this.model.group);
    this.buildTowerFor(vehicle);
    this.trailCount = 0; this.trailGeo.setDrawRange(0, 0);
    this.rocketGroup.quaternion.identity();
    this.vehicle = vehicle;
    this.mount.scale.set(Math.max(1, vehicle.diameter / 8), 1, Math.max(1, vehicle.diameter / 8));
    this.transporter.scale.set(Math.max(0.5, vehicle.height / 60), 1, Math.max(0.6, vehicle.diameter / 6));
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Vehicle pose on the crawlerway/erection for rollout progress p in [0,1]. */
  rolloutPose(p) {
    const H = this.vehicle.height, D = this.vehicle.diameter;
    const ease = (t) => t * t * (3 - 2 * t);
    const yHoriz = D / 2 + 3 + GROUND_Y;
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    if (p < 0.72) {
      const zc = 690 * (1 - ease(p / 0.72));
      pos.set(0, yHoriz, zc + H / 2);
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      return { pos, q, transporterZ: zc, erecting: false };
    }
    const f = ease((p - 0.72) / 0.28);
    const ang = -Math.PI / 2 * (1 - f);
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), ang);
    pos.set(0, lerp(yHoriz, 0, f), lerp(H / 2, 0, f));
    return { pos, q, transporterZ: 0, erecting: true };
  }

  // ---------- per-frame ----------
  update(dt, ctx) {
    this.time += dt;
    const { mode, sim } = ctx;
    this.sim = sim || null;
    const model = this.model;
    if (!model) return;
    const H = model.currentHeight();
    let rocketPos = new THREE.Vector3();
    let q = new THREE.Quaternion();
    let alt = 0;
    this.transporter.visible = false;

    if (mode === 'flight' && sim) {
      this.toLocal(sim.r, sim.t, rocketPos);
      const dir = this.dirToLocal(sim.thrustDir || sim.up || [0, 1, 0], sim.t);
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      alt = sim.tel.alt;
      model.setActiveStage(sim.stage);
      const pr = sim.tel.pressure / 101325;
      sim.v.stages.forEach((s, i) => model.setStageThrust(i, i === sim.stage ? sim.throttle : 0, pr, this.time));
      sim.boosters.forEach((b, j) => model.setBoosterThrust(j, b.attached && b.left > 0 && sim.t >= 0 && sim.stage === 0 ? 1 : 0, pr, this.time));
      model.setVent(sim.t < -1 ? 0.3 : 0, this.time);
      this.handleSeparations(sim);
      this.updateDebris(sim);
      this.updateTrail(sim);
      if (sim.liftedOff && alt < 600 && sim.throttle > 0.1) this.emitSmoke(rocketPos, alt);
    } else if (mode === 'rollout' || mode === 'build') {
      const pose = this.rolloutPose(mode === 'build' ? 0 : ctx.progress ?? 0);
      rocketPos.copy(pose.pos); q.copy(pose.q);
      this.transporter.visible = true;
      this.transporter.position.set(0, 1.5, pose.transporterZ);
      model.setActiveStage(0);
      model.setVent(0, this.time);
      sim && 0;
    } else {
      // on the pad
      model.setActiveStage(0);
      model.setVent(ctx.vent || 0, this.time);
      this.vehicle.stages.forEach((s, i) => model.setStageThrust(i, 0, 1, this.time));
    }
    if (ctx.assembly !== undefined) model.setAssembly(ctx.assembly);

    this.world.position.copy(rocketPos).negate();
    this.rocketGroup.quaternion.copy(q);
    this.updateSmoke(dt);
    this.updateSky(alt, mode);
    this.updateCamera(dt, ctx, rocketPos, q, H, alt);
    this.stars.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }

  updateSky(alt, mode) {
    const f = clamp(alt / 90000, 0, 1);
    const sky = new THREE.Color(0x86bdf0).lerp(new THREE.Color(0x02030a), Math.pow(f, 0.55));
    this.scene.background = sky;
    const fogDensity = (mode === 'flight' ? 1 : 1) * 1.6e-5 * Math.exp(-alt / 6500);
    if (!this.scene.fog) this.scene.fog = new THREE.FogExp2(sky, fogDensity);
    this.scene.fog.color.copy(new THREE.Color(0xa9c8e8).lerp(new THREE.Color(0x02030a), Math.pow(f, 0.55)));
    this.scene.fog.density = fogDensity;
    this.stars.material.opacity = Math.pow(f, 1.5);
    this.hemi.intensity = lerp(0.7, 0.25, f);
    this.sun.intensity = lerp(2.4, 3.0, f);
  }

  cycleCamera() {
    const modes = ['chase', 'pad', 'onboard', 'free', 'globe'];
    this.cameraMode = modes[(modes.indexOf(this.cameraMode) + 1) % modes.length];
    this.controls.enabled = this.cameraMode === 'free';
    if (this.cameraMode === 'free') { this.controls.target.set(0, (this.model?.currentHeight() || 50) / 2, 0); }
    return this.cameraMode;
  }

  updateCamera(dt, ctx, rocketPos, q, H, alt) {
    const cam = this.camera;
    const center = new THREE.Vector3(0, H / 2, 0).applyQuaternion(q);
    const D = this.vehicle.diameter;
    let mode = ctx.cameraMode || this.cameraMode;
    if (ctx.mode !== 'flight') mode = ctx.mode === 'pad' || ctx.mode === 'fuel' ? (ctx.cameraMode || 'padwide') : 'showcase';
    const k = 1 - Math.exp(-dt * 4);
    let fov = 45;
    if (mode === 'showcase') {
      const th = this.time * 0.12;
      const dist = Math.max(H * 2.0 + 20, 50);
      const p = center.clone().add(new THREE.Vector3(Math.cos(th) * dist, dist * 0.22 + H * 0.1, Math.sin(th) * dist));
      this.camPos.lerp(p, k); this.camTarget.lerp(center, k);
    } else if (mode === 'padwide') {
      const p = new THREE.Vector3(-H * 0.9 - 40, H * 0.45, H * 2.4 + 120);
      this.camPos.lerp(p, k); this.camTarget.lerp(center.clone().add(new THREE.Vector3(0, -H * 0.05, 0)), k);
    } else if (mode === 'chase') {
      let vdir = new THREE.Vector3(0, 1, 0);
      if (this.sim && this.sim.tel.speedRel > 30) {
        const f = this.frameAt(this.sim.t);
        const vr = sub(this.sim.vel, [OMEGA * this.sim.r[2], 0, -OMEGA * this.sim.r[0]]);
        vdir.set(dot(vr, f.e), dot(vr, f.u), -dot(vr, f.n)).normalize();
      }
      const dist = Math.max(H * 2.4, 60);
      const side = new THREE.Vector3(0, 1, 0).cross(vdir).normalize();
      if (side.lengthSq() < 0.01) side.set(1, 0, 0);
      const p = center.clone().addScaledVector(vdir, -dist).addScaledVector(new THREE.Vector3(0, 1, 0), dist * 0.25).addScaledVector(side, dist * 0.35);
      this.camPos.lerp(p, k); this.camTarget.lerp(center, k);
    } else if (mode === 'pad') {
      const p = new THREE.Vector3(-H * 1.2 - 80, 22 + GROUND_Y + 8, H * 3.2 + 220).add(this.world.position);
      this.camPos.copy(p); this.camTarget.lerp(center, k * 2);
      const dist = p.distanceTo(center);
      fov = clamp((2 * Math.atan((H * 1.8) / dist) * 180) / Math.PI, 1.2, 45);
    } else if (mode === 'onboard') {
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const sideV = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const p = new THREE.Vector3().addScaledVector(axis, H * 0.55).addScaledVector(sideV, D * 1.1);
      this.camPos.copy(p); this.camTarget.copy(new THREE.Vector3().addScaledVector(axis, -H * 0.5).addScaledVector(sideV, D * 0.4));
      fov = 70;
    } else if (mode === 'free') {
      this.controls.target.lerp(center, k);
      this.controls.update();
      cam.fov = 45; cam.updateProjectionMatrix();
      return;
    } else if (mode === 'globe') {
      const earthC = new THREE.Vector3(0, -RE + GROUND_Y, 0).add(this.world.position);
      const upDir = new THREE.Vector3().subVectors(new THREE.Vector3(0, 0, 0), earthC).normalize();
      const dist = RE + Math.max(alt * 3 + 4e6, 5.5e6);
      const east = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0);
      const p = earthC.clone().addScaledVector(upDir, dist).addScaledVector(east, -dist * 0.15);
      this.camPos.lerp(p, k); this.camTarget.lerp(earthC.clone().addScaledVector(upDir, RE * 0.75), k);
      fov = 45;
    }
    cam.position.copy(this.camPos);
    cam.lookAt(this.camTarget);
    cam.fov += (fov - cam.fov) * k;
    cam.updateProjectionMatrix();
  }

  // ---------- effects ----------
  emitSmoke(rocketPos, alt) {
    const n = alt < 150 ? 4 : 1;
    for (let i = 0; i < n; i++) {
      const p = this.smoke.find((s) => s.life <= 0);
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const spread = alt < 150 ? 1 : 0.2;
      p.s.position.set(rocketPos.x + Math.cos(a) * 6, Math.max(2, rocketPos.y - GROUND_Y - 6 - Math.min(alt, 30)), rocketPos.z + Math.sin(a) * 6);
      p.vel.set(Math.cos(a) * (25 + Math.random() * 30) * spread, 6 + Math.random() * 10, Math.sin(a) * (25 + Math.random() * 30) * spread);
      p.life = 6 + Math.random() * 6;
      p.s.visible = true;
      p.s.scale.set(12, 12, 1);
      p.s.material.opacity = 0.55;
    }
  }
  updateSmoke(dt) {
    for (const p of this.smoke) {
      if (p.life <= 0) { p.s.visible = false; continue; }
      p.life -= dt;
      p.s.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - dt * 0.6);
      p.vel.y += dt * 3;
      const sc = p.s.scale.x + dt * 18;
      p.s.scale.set(sc, sc, 1);
      p.s.material.opacity = Math.max(0, Math.min(0.55, p.life * 0.1));
    }
  }

  updateTrail(sim) {
    if (sim.t - this.trailLastT < 0.5 || this.trailCount >= this.trailMax) return;
    this.trailLastT = sim.t;
    const p = this.toLocal(sim.r, sim.t);
    const arr = this.trailGeo.attributes.position.array;
    arr[this.trailCount * 3] = p.x; arr[this.trailCount * 3 + 1] = p.y; arr[this.trailCount * 3 + 2] = p.z;
    this.trailCount++;
    this.trailGeo.attributes.position.needsUpdate = true;
    this.trailGeo.setDrawRange(0, this.trailCount);
  }

  handleSeparations(sim) {
    while (sim.separations.length) {
      const d = sim.separations.shift();
      let groups = [];
      if (d.kind === 'stage') groups = [this.model.detachStage(d.index)];
      else if (d.kind === 'booster') groups = this.model.detachBoosters(d.index);
      else if (d.kind === 'fairing') groups = this.model.detachFairing();
      else if (d.kind === 'payload') groups = [this.model.detachPayload()];
      const q = this.rocketGroup.quaternion.clone();
      const offs = groups.map((g) => g.position.clone().sub(new THREE.Vector3(0, this.model.stageBase[sim.stage] || 0, 0)));
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      groups.forEach((g) => { this.world.add(g); });
      this.debris.push({ d, groups, q, offs, axis, rate: d.kind === 'fairing' ? 0.6 : d.kind === 'payload' ? 0.05 : 0.25, t0: sim.t });
    }
  }

  updateDebris(sim) {
    for (const e of this.debris) {
      const { d } = e;
      const p = this.toLocal(d.r, sim.t);
      const age = sim.t - e.t0;
      const spin = new THREE.Quaternion().setFromAxisAngle(e.axis, d.reusable ? 0 : age * e.rate);
      let q = e.q.clone().multiply(spin);
      if (d.reusable && age > 8) {
        // landing booster flies tail-first, then stands upright on the deck
        const upL = this.dirToLocal(norm(d.r), sim.t);
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), upL);
      }
      e.groups.forEach((g, i) => {
        const off = e.offs[i].clone().applyQuaternion(e.q);
        if (d.kind === 'fairing' && e.groups.length === 2) off.add(new THREE.Vector3(i ? 1 : -1, 0, 0).applyQuaternion(e.q).multiplyScalar(age * 2.5));
        g.position.copy(p).add(off);
        g.quaternion.copy(q);
        g.visible = d.alive || !!d.impact?.landed;
      });
    }
  }
}
