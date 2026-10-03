// Generates build/icon.png (512x512 rocket on a dark gradient) with no dependencies.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const N = 512;
const px = Buffer.alloc(N * N * 4);
const put = (x, y, r, g, b, a = 255) => {
  const i = (y * N + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
};
// signed distance helpers (coordinates centred, y up)
const inBody = (x, y) => Math.abs(x) < 52 && y > -130 && y < 90 || (y >= 90 && y < 190 && Math.abs(x) < 52 * Math.sqrt(1 - ((y - 90) / 100) ** 2));
const inFin = (x, y) => y > -170 && y < -40 && Math.abs(x) > 40 && Math.abs(x) < 40 + (y + 170) * 0.5 && Math.abs(x) < 110 && y < -170 + (110 - Math.abs(x)) * 2.2;
const inWin = (x, y) => x * x + (y - 40) * (y - 40) < 26 * 26;
const inFlame = (x, y) => y < -130 && y > -230 + Math.abs(x) * 2 && Math.abs(x) < 36;
for (let py = 0; py < N; py++) for (let pxx = 0; pxx < N; pxx++) {
  const x = pxx - N / 2, y = N / 2 - py;
  const d = Math.hypot(x, y) / (N / 2);
  const rr = Math.round(14 + 20 * (1 - d)), gg = Math.round(20 + 34 * (1 - d)), bb = Math.round(40 + 60 * (1 - d));
  let c = [rr, gg, bb];
  if (inFlame(x, y)) c = [255, 160 + Math.round(y + 230) / 2, 40];
  if (inFin(x, y)) c = [214, 64, 52];
  if (inBody(x, y)) c = [236, 240, 246];
  if (inWin(x, y)) c = [60, 130, 210];
  put(pxx, py, ...c);
}
// PNG encode
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4); }
mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote build/icon.png');
