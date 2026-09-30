// Temporary diagnostic (not for merge): per-function digests of Math results, to find which ones differ between
// Linux and Windows builds of Node 24.19.0 and explain the golden differences.
'use strict';
const { test } = require('node:test');
const { createHash } = require('node:crypto');

test('diag: Math digests', () => {
  let s = 12345;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const N = 200000;
  const xs = Float64Array.from({ length: N }, () => (rnd() - 0.5) * 2000);
  const us = Float64Array.from({ length: N }, () => rnd() * 2 - 1);
  const ps = Float64Array.from({ length: N }, () => rnd() * 50);
  const one = {
    sin: x => Math.sin(x), cos: x => Math.cos(x), tan: x => Math.tan(x), atan: x => Math.atan(x),
    exp: x => Math.exp(x / 20), expm1: x => Math.expm1(x / 20), log: x => Math.log(Math.abs(x) + 1e-3),
    log1p: x => Math.log1p(Math.abs(x)), log2: x => Math.log2(Math.abs(x) + 1e-3), log10: x => Math.log10(Math.abs(x) + 1e-3),
    cbrt: x => Math.cbrt(x), sinh: x => Math.sinh(x / 100), cosh: x => Math.cosh(x / 100), tanh: x => Math.tanh(x / 100),
    asinh: x => Math.asinh(x), sqrt: x => Math.sqrt(Math.abs(x)),
  };
  const out = {};
  for (const [k, f] of Object.entries(one)) {
    const r = new Float64Array(N);
    for (let i = 0; i < N; i++) r[i] = f(xs[i]);
    out[k] = createHash('sha256').update(Buffer.from(r.buffer)).digest('hex').slice(0, 16);
  }
  const two = {
    asin: i => Math.asin(us[i]), acos: i => Math.acos(us[i]), atan2: i => Math.atan2(xs[i], xs[(i * 7) % N]),
    pow: i => Math.pow(Math.abs(xs[i]) / 100 + 0.01, ps[i] / 10), powInt: i => Math.pow(xs[i] / 100, (i % 5) + 1),
    hypot: i => Math.hypot(xs[i], xs[(i * 3) % N]), hypot3: i => Math.hypot(xs[i], us[i], ps[i]),
    fround: i => Math.fround(xs[i] * 1.1), expFrac: i => Math.exp(-ps[i]) * Math.sin(xs[i] * 0.013),
  };
  for (const [k, f] of Object.entries(two)) {
    const r = new Float64Array(N);
    for (let i = 0; i < N; i++) r[i] = f(i);
    out[k] = createHash('sha256').update(Buffer.from(r.buffer)).digest('hex').slice(0, 16);
  }
  console.log('DIAG-MATH ' + process.platform + ' ' + process.version + ' ' + JSON.stringify(out));
});
