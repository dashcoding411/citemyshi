// Draws the citemyshi icon (gradient rounded square with a white quote mark)
// as PNGs for the Word add-in manifest. Run: node scripts/make-icons.js
import fs from 'node:fs';
import zlib from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };

function draw(size) {
  const ss = 4; // supersampling
  const px = Buffer.alloc(size * size * 4);
  const r = size * 0.22;
  const inRounded = (x, y) => {
    const cx = Math.min(Math.max(x, r), size - r), cy = Math.min(Math.max(y, r), size - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  // A quote mark "“" = two blobs, each a circle with a tail curving up
  const blob = (x, y, ox) => {
    const cx = size * ox, cy = size * 0.6, rad = size * 0.1;
    if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) return true;
    // tail: a thick arc from the circle's top-left going up and right
    const tx = cx + size * 0.02, ty = cy - size * 0.07;
    const d = Math.hypot(x - (tx + size * 0.11), y - (ty - size * 0.02));
    return d >= size * 0.13 && d <= size * 0.19 && x < tx + size * 0.05 && y < cy && y > cy - size * 0.28;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let a = 0, rr = 0, g = 0, b = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const fx = x + (sx + 0.5) / ss, fy = y + (sy + 0.5) / ss;
      if (!inRounded(fx, fy)) continue;
      a++;
      if (blob(fx, fy, 0.36) || blob(fx, fy, 0.62)) { rr += 255; g += 255; b += 255; }
      else { const t = (fx + fy) / (2 * size); rr += 59 + (123 - 59) * t; g += 91 + (92 - 91) * t; b += 253 + (255 - 253) * t; }
    }
    const i = (y * size + x) * 4;
    if (a) { px[i] = rr / a; px[i + 1] = g / a; px[i + 2] = b / a; }
    px[i + 3] = (a / (ss * ss)) * 255;
  }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const s of [16, 32, 64, 80, 128]) fs.writeFileSync(`public/addin/icon-${s}.png`, draw(s));
console.log('icons written');
