#!/usr/bin/env node
// The application icon: a "Little Bird" (AH-6 / MD 500) seen from the side, nose to the right: egg-shaped cabin with its
// big bubble canopy, thin tail boom, T-tail, skids and main rotor, in the page's accent colour on a slate rounded
// square. It is our own drawing from simple shapes (ellipses, polygons, strokes): no game art, photo, logo, text or font.
// The menu's header logo (src/index.template.html) is the same drawing in one colour, the canopy left open (logoSvg()).
// Zero dependencies: the shapes below are rasterised here (4x4 supersampling) into an .ico with seven sizes (16 to 128 px
// as 32-bit bitmaps, 256 px as PNG) and a 256 px .png, and written as SVG to build/icon.svg for reading and review.
// An .ico holds one image per size, so the small sizes are drawn for their pixels: every stroke is at least one pixel
// wide, the canopy keeps at least one pixel of frame, level and upright strokes sit on the pixel grid up to 48 px,
// and up to 32 px the tail is a plain T (layers limited by `from` / `to`, in pixels). Nothing binary is committed: the
// packaging steps run this script first (npm run icon), and the output is the same bytes on every run.
//   node scripts/make-icon.mjs [--out dist/icon] [--write-svg] [--check]   (--check: build/icon.svg equals the design)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Colours: the page's tokens (src/style.css), and a light glint on the canopy.
const ACCENT = [0x38, 0xbd, 0xd4]; // --accent: the airframe
const GLASS = [0x04, 0x22, 0x2a]; // --accent-ink: the tinted canopy
const GLINT = [0x9f, 0xe6, 0xf2];

// The cabin is a teardrop "egg" (short round nose rxF, long tapering rear rxB), pitched 7 degrees nose-down about its
// centre so that its tail end rises to meet the boom. The canopy is the front of the egg inside a circle, whose arc is
// the curved door frame behind it; a rim of airframe (`rim`, never under one pixel) stays around the glass.
const PITCH = [7, 29, 24]; // degrees, clockwise on screen (SVG rotate), about (29, 24)
const EGG = { cx: 29, cy: 24, rxF: 9.4, rxB: 14.6, ry: 8.7 };
const CABIN = { t: 'egg', ...EGG, rot: PITCH };
const CANOPY = { t: 'canopy', ...EGG, rim: 1.4, cut: { cx: 39.4, cy: 22.6, r: 11.4 }, rot: PITCH };

// Painter's order, in a 48-unit square (y down), points written "x,y x,y ..." as in SVG. Shapes: line (round-capped
// polyline of width w, at least 1 px; snap 'x' or 'y' moves an upright or level line onto the pixel grid up to 48 px),
// poly, ellipse, egg, canopy; `rot` turns a shape about a point. A layer is drawn from `from` px and up to `to` px when
// they are given.
const pts = (text) => text.split(' ').map((p) => p.split(',').map(Number));
const line = (p, w, more = {}) => ({ t: 'line', pts: pts(p), w, ...more });
const poly = (p) => ({ t: 'poly', pts: pts(p) });
export const DESIGN = {
  box: 48,
  radius: 9,
  top: [0x1c, 0x26, 0x2d], // slate, lighter at the top (page tokens --surface-2 / --surface-3)
  bottom: [0x0f, 0x14, 0x18],
  layers: [
    // Main rotor: one blade seen edge-on, reaching further forward than aft of the mast; mast and hub.
    { ink: ACCENT, shape: line('11,10.8 44.6,10.8', 1.8, { snap: 'y' }) },
    { ink: ACCENT, shape: line('29.6,16.4 29.6,11.2', 2.2, { snap: 'x' }) },
    { ink: ACCENT, shape: { t: 'ellipse', cx: 29.6, cy: 11, rx: 2.8, ry: 1.5 }, from: 32 },
    // Tail boom: thin, tapering, rising a little to the tail; its core line keeps one pixel at 16 px.
    { ink: ACCENT, shape: poly('18,20.2 18,23.4 6.6,19.8 6.6,18.4') },
    { ink: ACCENT, shape: line('17,21.7 6.6,19.1', 1.4) },
    // T-tail from 48 px: swept fin, horizontal stabiliser seen edge-on, end plate at its tip, ventral fin; and from
    // 64 px the tail rotor's two blades.
    { ink: ACCENT, shape: poly('9.2,19.4 6.4,19.6 4.4,13.4 6.8,13.4'), from: 48 },
    { ink: ACCENT, shape: line('2.9,13.4 8.8,13.4', 1.5, { snap: 'y' }), from: 48 },
    { ink: ACCENT, shape: poly('3,10.8 4.8,10.8 5.2,16 3.4,16'), from: 48 },
    { ink: ACCENT, shape: poly('7.4,19.6 9.4,19.8 7.4,23.8 6.2,23.6'), from: 48 },
    { ink: ACCENT, shape: line('5.4,16.3 8.6,22.3', 0.9), from: 64 },
    // T-tail up to 32 px: an upright fin and the stabiliser on the pixel grid; at 32 px the end plate and ventral fin.
    { ink: ACCENT, shape: line('6.4,19.6 6.4,13.4', 1.6, { snap: 'x' }), to: 32 },
    { ink: ACCENT, shape: line('3.2,13.4 8.6,13.4', 1.5, { snap: 'y' }), to: 32 },
    { ink: ACCENT, shape: line('3.9,11.2 3.9,15.6', 1.5, { snap: 'x' }), from: 32, to: 32 },
    { ink: ACCENT, shape: line('7.6,20.2 6.8,23.2', 1.4), from: 32, to: 32 },
    // Landing gear, near side: two legs (the front one starts below the canopy) and the skid with its upturned toe.
    { ink: ACCENT, shape: line('21.4,29.2 20.6,36.8', 1.7, { snap: 'x' }) },
    { ink: ACCENT, shape: line('32.54,32 33.4,36.8', 1.7, { snap: 'x' }) },
    { ink: ACCENT, shape: line('16.4,36.8 38.2,36.8 40.8,34.8', 1.8, { snap: 'y' }) },
    // Cabin, canopy, and from 48 px a glint along the canopy's upper curve.
    { ink: ACCENT, shape: CABIN },
    { ink: GLASS, shape: CANOPY, hole: true },
    { ink: GLINT, shape: line('32.2,17.6 35,18.9 36.8,21', 1.1, { rot: PITCH }), from: 48 },
  ],
};
export const SIZES = [16, 24, 32, 48, 64, 128, 256];

const shown = (layer, size) => (layer.from ?? 0) <= size && size <= (layer.to ?? Infinity);

// ---- inside tests, in design units ----
function unrotate(px, py, rot) {
  if (!rot) return [px, py];
  const [deg, cx, cy] = rot;
  const a = (-deg * Math.PI) / 180;
  const c = Math.cos(a),
    s = Math.sin(a);
  const x = px - cx,
    y = py - cy;
  return [cx + x * c - y * s, cy + x * s + y * c];
}
function inEgg(x, y, e, inset = 0) {
  const u = (x - e.cx) / ((x >= e.cx ? e.rxF : e.rxB) - inset),
    v = (y - e.cy) / (e.ry - inset);
  return u * u + v * v <= 1;
}
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1,
    dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
}
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i],
      [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function roundedBox(px, py, size, r) {
  const qx = Math.abs(px - size / 2) - (size / 2 - r),
    qy = Math.abs(py - size / 2) - (size / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
// The canopy's frame at `size` px: `rim` units, and never under one pixel.
const rimAt = (s, size, box) => Math.max(s.rim, box / size);
// A line's width in pixels at `size` px and its offset (in units) onto the pixel grid, for a snapped line up to 48 px:
// a whole number of pixels, centred on a pixel centre (odd width) or a pixel edge (even width).
function lineAt(s, size, box) {
  const scale = size / box;
  let px = Math.max(s.w * scale, 1);
  let dx = 0,
    dy = 0;
  if (s.snap && size <= 48) {
    px = Math.max(1, Math.round(px));
    const at = (s.snap === 'y' ? s.pts[0][1] : s.pts[0][0]) * scale;
    const target = px % 2 ? Math.floor(at) + 0.5 : Math.round(at);
    if (s.snap === 'y') dy = target / scale - s.pts[0][1];
    else dx = target / scale - s.pts[0][0];
  }
  return { half: px / 2 / scale, dx, dy };
}

function inside(s, x0, y0, size, box) {
  const [x, y] = unrotate(x0, y0, s.rot);
  switch (s.t) {
    case 'ellipse': {
      const u = (x - s.cx) / s.rx,
        v = (y - s.cy) / s.ry;
      return u * u + v * v <= 1;
    }
    case 'egg':
      return inEgg(x, y, s);
    case 'canopy': {
      const dx = x - s.cut.cx,
        dy = y - s.cut.cy;
      return dx * dx + dy * dy <= s.cut.r * s.cut.r && inEgg(x, y, s, rimAt(s, size, box));
    }
    case 'poly':
      return inPoly(x, y, s.pts);
    case 'line': {
      const { half, dx, dy } = lineAt(s, size, box);
      for (let i = 1; i < s.pts.length; i++) {
        const [x1, y1] = s.pts[i - 1],
          [x2, y2] = s.pts[i];
        if (segDist(x, y, x1 + dx, y1 + dy, x2 + dx, y2 + dy) <= half) return true;
      }
      return false;
    }
    default:
      throw new Error('make-icon: unknown shape ' + s.t);
  }
}

// RGBA pixels of the icon at `size` px (straight alpha).
export function render(size, d = DESIGN) {
  const scale = size / d.box;
  const layers = d.layers.filter((l) => shown(l, size));
  const out = new Uint8Array(size * size * 4);
  const N = 4;
  for (let y = 0; y < size; y++) {
    const t = (y + 0.5) / size;
    const base = [0, 1, 2].map((c) => d.top[c] + (d.bottom[c] - d.top[c]) * t);
    for (let x = 0; x < size; x++) {
      let bg = 0;
      const sum = [0, 0, 0];
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const u = (x + (sx + 0.5) / N) / scale,
            v = (y + (sy + 0.5) / N) / scale;
          if (roundedBox(u, v, d.box, d.radius) > 0) continue;
          bg++;
          let ink = base;
          for (const l of layers) if (inside(l.shape, u, v, size, d.box)) ink = l.ink;
          for (let c = 0; c < 3; c++) sum[c] += ink[c];
        }
      }
      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) out[o + c] = bg ? Math.round(sum[c] / bg) : 0;
      out[o + 3] = Math.round((bg / (N * N)) * 255);
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

// ---- SVG: the large view (the layers shown at 256 px) ----
const num = (v) => String(+v.toFixed(3) || 0);
const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
const turn = (s) => (s.rot ? ` transform="rotate(${s.rot.map(num).join(' ')})"` : '');
const eggPath = ({ cx, cy, rxF, rxB, ry }, k = 0) => {
  const [f, b, r] = [rxF - k, rxB - k, ry - k].map(num);
  return (
    `M${num(cx + rxF - k)} ${num(cy)} A${f} ${r} 0 0 1 ${num(cx)} ${num(cy + ry - k)} ` +
    `A${b} ${r} 0 0 1 ${num(cx - rxB + k)} ${num(cy)} A${b} ${r} 0 0 1 ${num(cx)} ${num(cy - ry + k)} ` +
    `A${f} ${r} 0 0 1 ${num(cx + rxF - k)} ${num(cy)}Z`
  );
};
// The canopy's outline (unrotated): from where the door-frame circle meets the inset egg's front above the nose, round
// the nose to where it meets it below, then back along the circle. Both meeting points are found by bisection.
function canopyPath(s, rim) {
  const a = s.rxF - rim,
    b = s.ry - rim,
    { cx, cy, r } = s.cut;
  const at = (th) => [s.cx + a * Math.cos(th), s.cy + b * Math.sin(th)];
  const out = (th) => {
    const [x, y] = at(th);
    return (x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r;
  };
  const meet = (from, to) => {
    if (!out(from) || out(to)) throw new Error('make-icon: the canopy circle must cut the front of the egg');
    for (let i = 0; i < 60; i++) {
      const mid = (from + to) / 2;
      if (out(mid)) from = mid;
      else to = mid;
    }
    return (from + to) / 2;
  };
  const t1 = meet(-Math.PI / 2, 0),
    t2 = meet(Math.PI / 2, 0);
  const [x1, y1] = at(t1),
    [x2, y2] = at(t2);
  const f1 = Math.atan2(y1 - cy, x1 - cx) + 2 * Math.PI,
    f2 = Math.atan2(y2 - cy, x2 - cx);
  const big = (span) => (span > Math.PI ? 1 : 0);
  return (
    `M${num(x1)} ${num(y1)} A${num(a)} ${num(b)} 0 ${big(t2 - t1)} 1 ${num(x2)} ${num(y2)} ` +
    `A${num(r)} ${num(r)} 0 ${big(f1 - f2)} 1 ${num(x1)} ${num(y1)}Z`
  );
}
// Path data of a filled shape, or null for a line.
function fillPath(s) {
  switch (s.t) {
    case 'ellipse':
      return (
        `M${num(s.cx + s.rx)} ${num(s.cy)} A${num(s.rx)} ${num(s.ry)} 0 0 1 ${num(s.cx - s.rx)} ${num(s.cy)} ` +
        `A${num(s.rx)} ${num(s.ry)} 0 0 1 ${num(s.cx + s.rx)} ${num(s.cy)}Z`
      );
    case 'egg':
      return eggPath(s);
    case 'canopy':
      return canopyPath(s, s.rim);
    case 'poly':
      return 'M' + s.pts.map(([x, y]) => `${num(x)} ${num(y)}`).join(' L') + 'Z';
    default:
      return null;
  }
}
const linePath = (s) => 'M' + s.pts.map(([x, y]) => `${num(x)} ${num(y)}`).join(' L');

export function svg(d = DESIGN) {
  const body = d.layers
    .filter((l) => shown(l, 256))
    .map(({ ink, shape: s }) => {
      const fill = fillPath(s);
      return fill
        ? `  <path d="${fill}" fill="${hex(ink)}"${turn(s)}/>`
        : `  <path d="${linePath(s)}" fill="none" stroke="${hex(ink)}" stroke-width="${num(s.w)}" stroke-linecap="round" stroke-linejoin="round"${turn(s)}/>`;
    });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.box} ${d.box}" width="256" height="256">`,
    '  <title>LittleBird Trainer</title>',
    `  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hex(d.top)}"/><stop offset="1" stop-color="${hex(d.bottom)}"/></linearGradient></defs>`,
    `  <rect width="${d.box}" height="${d.box}" rx="${d.radius}" fill="url(#bg)"/>`,
    ...body,
    '</svg>',
    '',
  ].join('\n');
}

// The menu's header logo: the airframe of the 48 px icon in currentColor (the page's accent), without the square; the
// canopy is a hole in the cabin (even-odd), so the header shows through it as dark glass. One line of markup, as the
// template holds it.
export function logoSvg(d = DESIGN) {
  const layers = d.layers.filter((l) => shown(l, 48) && l.ink === ACCENT);
  const hole = d.layers.find((l) => l.hole);
  const fills = [],
    strokes = [];
  for (const { shape: s } of layers) {
    if (s.t === 'line') strokes.push(`<path d="${linePath(s)}" stroke-width="${num(s.w)}"${turn(s)}/>`);
    else if (s === CABIN)
      fills.push(`<path fill-rule="evenodd" d="${fillPath(s)} ${fillPath(hole.shape)}"${turn(s)}/>`);
    else fills.push(`<path d="${fillPath(s)}"${turn(s)}/>`);
  }
  return (
    '<svg viewBox="2 2 44 44">' +
    `<g fill="currentColor">${fills.join('')}</g>` +
    `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${strokes.join('')}</g>` +
    '</svg>'
  );
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
