// Physical constants and shared helpers.
// Frame convention (matches three.js SphereGeometry UVs): +Y is the north pole axis,
// longitude 0 lies on +X, and east of 0 lies toward -Z.

export const G0 = 9.80665;
export const MU = 3.986004418e14;      // Earth gravitational parameter (m^3/s^2)
export const RE = 6371000;             // mean Earth radius (m)
export const OMEGA = 7.2921159e-5;     // Earth sidereal rotation rate (rad/s)
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// --- tiny vec3 helpers on plain arrays (fast, allocation-light physics) ---
export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Earth-fixed unit vector for a geodetic (spherical) latitude/longitude in degrees. */
export function latLonToUnit(latDeg, lonDeg) {
  const p = latDeg * DEG, l = lonDeg * DEG;
  return [Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)];
}

/** Inertial position -> {lat, lon} given Earth rotation angle (rad) since epoch. */
export function inertialToLatLon(r, earthAngle) {
  const c = Math.cos(-earthAngle), s = Math.sin(-earthAngle);
  // rotate about +Y by -earthAngle (three.js rotation convention)
  const x = r[0] * c + r[2] * s;
  const z = -r[0] * s + r[2] * c;
  const rr = len(r);
  return { lat: Math.asin(r[1] / rr) / DEG, lon: Math.atan2(-z, x) / DEG };
}

/** Local east / north / up basis at an inertial position. */
export function localFrame(r) {
  const up = norm(r);
  let east = cross([0, 1, 0], up);
  if (len(east) < 1e-9) east = [1, 0, 0];
  east = norm(east);
  const north = cross(up, east);
  return { up, east, north };
}

/** Velocity of the rotating atmosphere / ground at inertial position r. */
export const surfaceVelocity = (r) => [OMEGA * r[2], 0, -OMEGA * r[0]];

/**
 * 1976 US Standard Atmosphere (piecewise temperature, exponential pressure fit).
 * Returns density (kg/m^3), pressure (Pa), temperature (K) and speed of sound (m/s).
 */
export function atmosphere(h) {
  if (h > 150000) return { rho: 0, p: 0, T: 800, a: 300 };
  const hk = Math.max(0, h) / 1000;
  let T;
  if (hk < 11) T = 288.15 - 6.5 * hk;
  else if (hk < 20) T = 216.65;
  else if (hk < 32) T = 216.65 + (hk - 20);
  else if (hk < 47) T = 228.65 + 2.8 * (hk - 32);
  else if (hk < 51) T = 270.65;
  else if (hk < 71) T = 270.65 - 2.8 * (hk - 51);
  else if (hk < 86) T = 214.65 - 2.0 * (hk - 71);
  else T = 186.87;
  const p = 101325 * Math.exp(-hk / 7.2) * (hk > 86 ? Math.exp(-(hk - 86) / 18) : 1);
  const rho = p / (287.05 * T);
  return { rho, p, T, a: Math.sqrt(1.4 * 287.05 * T) };
}

/** Transonic drag-coefficient curve for a slender launch vehicle. */
export function dragCoefficient(mach) {
  if (mach < 0.8) return 0.3;
  if (mach < 1.1) return 0.3 + ((mach - 0.8) / 0.3) * 0.22;
  if (mach < 1.4) return 0.52;
  if (mach < 3) return 0.52 - ((mach - 1.4) / 1.6) * 0.22;
  if (mach < 6) return 0.3 - ((mach - 3) / 3) * 0.08;
  return 0.22;
}

/** Two-body orbital elements from inertial state. */
export function orbitalElements(r, v) {
  const rm = len(r);
  const v2 = dot(v, v);
  const h = cross(r, v);
  const hm = len(h);
  const eVec = sub(scale(cross(v, h), 1 / MU), scale(r, 1 / rm));
  const e = len(eVec);
  const energy = v2 / 2 - MU / rm;
  const a = -MU / (2 * energy);
  const rp = hm * hm / MU / (1 + e);
  const ra = e < 1 ? a * (1 + e) : Infinity;
  const inc = Math.acos(clamp(h[1] / (hm || 1), -1, 1)) / DEG;
  const period = e < 1 && a > 0 ? 2 * Math.PI * Math.sqrt(a ** 3 / MU) : Infinity;
  return { a, e, eVec, h, rp, ra, periapsis: rp - RE, apoapsis: ra - RE, inc, period, energy };
}

export function fmtTime(sec, signed = true) {
  const s = Math.abs(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const pad = (n) => String(n).padStart(2, '0');
  const sign = signed ? (sec < 0 ? 'T-' : 'T+') : '';
  return h > 0 ? `${sign}${h}:${pad(m)}:${pad(ss)}` : `${sign}${pad(m)}:${pad(ss)}`;
}
