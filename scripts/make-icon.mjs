#!/usr/bin/env node
// The application icon, drawn from the trainer's own logo (the page's header logo: rotor hub, crossed blades and tail
// boom) on a slate rounded square, in the page's accent colour. Zero dependencies: the shapes below are rasterised
// here (4x4 supersampling, signed distances) into an .ico with seven sizes (16 to 128 px as 32-bit bitmaps, 256 px as
// PNG) and a 256 px .png, and written as SVG to build/icon.svg for reading and review. Nothing binary is committed:
// the packaging steps run this script first (npm run icon), and the output is the same bytes on every run.
//   node scripts/make-icon.mjs [--out dist/icon] [--check]   (--check: build/icon.svg equals the shapes below)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Design (chosen), in the logo's 40-unit box, placed in a 48-unit square.
export const DESIGN = {
  box: 48,
  offset: 4,
  radius: 9,
  top: [0x1c, 0x26, 0x2d], // slate, lighter at the top (page tokens --surface-2 / --surface-3)
  bottom: [0x0f, 0x14, 0x18],
  ink: [0x38, 0xbd, 0xd4], // page accent --accent
  stroke: 2.4,
  ellipse: { cx: 20, cy: 17, rx: 5, ry: 7 },
  segments: [
    [20, 24, 20, 36],
    [16, 36, 24, 36],
    [5, 10, 35, 24],
    [5, 24, 35, 10],
  ],
};
export const SIZES = [16, 24, 32, 48, 64, 128, 256];

function segDist(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1,
    dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
}
function ellipseDist(px, py, { cx, cy, rx, ry }) {
  const x = px - cx,
    y = py - cy;
  const k = Math.hypot(x / rx, y / ry);
  const g = Math.hypot(x / (rx * rx), y / (ry * ry));
  return g === 0 ? Math.min(rx, ry) : Math.abs((k * k - 1) / (2 * g * Math.max(k, 1e-9)));
}
function roundedBox(px, py, size, r) {
  const qx = Math.abs(px - size / 2) - (size / 2 - r),
    qy = Math.abs(py - size / 2) - (size / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// RGBA pixels of the icon at `size` px (straight alpha).
export function render(size, d = DESIGN) {
  const scale = size / d.box;
  // Small sizes keep a stroke of at least 1.3 px so the drawing stays readable.
  const half = Math.max(d.stroke * scale, size <= 32 ? 1.3 : 0) / 2 / scale;
  const out = new Uint8Array(size * size * 4);
  const N = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0,
        ink = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const u = (x + (sx + 0.5) / N) / scale,
            v = (y + (sy + 0.5) / N) / scale;
          if (roundedBox(u, v, d.box, d.radius) > 0) continue;
          bg++;
          const lx = u - d.offset,
            ly = v - d.offset;
          let dist = ellipseDist(lx, ly, d.ellipse);
          for (const s of d.segments) dist = Math.min(dist, segDist(lx, ly, s));
          if (dist <= half) ink++;
        }
      }
      const a = bg / (N * N),
        k = bg ? ink / bg : 0,
        t = (y + 0.5) / size;
      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        const base = d.top[c] + (d.bottom[c] - d.top[c]) * t;
        out[o + c] = Math.round(base + (d.ink[c] - base) * k);
      }
      out[o + 3] = Math.round(a * 255);
    }
  }
  return out;
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
export function png(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  const idat = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
// A 32-bit DIB icon image: header, bottom-up BGRA rows, then an all-zero AND mask (the alpha channel is used).
function dib(rgba, size) {
  const head = Buffer.alloc(40);
  head.writeUInt32LE(40, 0);
  head.writeInt32LE(size, 4);
  head.writeInt32LE(size * 2, 8);
  head.writeUInt16LE(1, 12);
  head.writeUInt16LE(32, 14);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 4,
        o = ((size - 1 - y) * size + x) * 4;
      pixels[o] = rgba[s + 2];
      pixels[o + 1] = rgba[s + 1];
      pixels[o + 2] = rgba[s];
      pixels[o + 3] = rgba[s + 3];
    }
  const mask = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
  head.writeUInt32LE(pixels.length + mask.length, 20);
  return Buffer.concat([head, pixels, mask]);
}
export function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head[e] = size >= 256 ? 0 : size;
    head[e + 1] = size >= 256 ? 0 : size;
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map((i) => i.data)]);
}
export function svg(d = DESIGN) {
  const c = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
  const { cx, cy, rx, ry } = d.ellipse;
  const segs = d.segments.map(([x1, y1, x2, y2]) => `M${x1} ${y1} L${x2} ${y2}`).join(' ');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.box} ${d.box}" width="256" height="256">`,
    '  <title>LittleBird Trainer</title>',
    `  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c(d.top)}"/><stop offset="1" stop-color="${c(d.bottom)}"/></linearGradient></defs>`,
    `  <rect width="${d.box}" height="${d.box}" rx="${d.radius}" fill="url(#bg)"/>`,
    `  <g transform="translate(${d.offset} ${d.offset})" fill="none" stroke="${c(d.ink)}" stroke-width="${d.stroke}" stroke-linecap="round">`,
    `    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`,
    `    <path d="${segs}"/>`,
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
}

export function makeIcon() {
  const images = SIZES.map((size) => {
    const px = render(size);
    return { size, px, data: size >= 256 ? png(px, size) : dib(px, size) };
  });
  const big = images.find((i) => i.size === 256);
  return { ico: ico(images), png: png(big.px, 256), svg: svg() };
}

function main() {
  const argv = process.argv.slice(2);
  const svgFile = path.join(ROOT, 'build', 'icon.svg');
  if (argv.includes('--check')) {
    const ok = fs.existsSync(svgFile) && fs.readFileSync(svgFile, 'utf8').replace(/\r\n/g, '\n') === svg();
    console.log(
      ok ? 'make-icon: build/icon.svg matches the design' : 'make-icon: build/icon.svg differs from the design',
    );
    process.exit(ok ? 0 : 1);
  }
  const i = argv.indexOf('--out');
  const out = i >= 0 ? path.resolve(argv[i + 1]) : path.join(ROOT, 'dist', 'icon');
  const { ico: icoBytes, png: pngBytes, svg: svgText } = makeIcon();
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'icon.ico'), icoBytes);
  fs.writeFileSync(path.join(out, 'icon.png'), pngBytes);
  if (argv.includes('--write-svg')) fs.writeFileSync(svgFile, svgText);
  console.log(`make-icon: ${path.relative(ROOT, out).replace(/\\/g, '/')}/icon.ico (${SIZES.join(', ')} px), icon.png`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
