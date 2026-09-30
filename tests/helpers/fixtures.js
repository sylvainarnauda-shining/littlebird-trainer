'use strict';
// Recording-derived numeric fixtures (tests/fixtures/MANIFEST.json): every file is checked against its sha256 before
// use. Bench series (60 Hz, HUD readings and key overlay of the two reference recordings) and the legacy 30 Hz replay
// series, loaded as the analysis tools read them.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { FIXTURES } = require('./paths');

const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'MANIFEST.json'), 'utf8'));
const cache = new Map();

function read(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const entry = manifest.files.find((f) => f.file === rel);
  if (!entry) throw Error('fixture not in tests/fixtures/MANIFEST.json: ' + rel);
  const buf = fs.readFileSync(path.join(FIXTURES, rel));
  const sum = crypto.createHash('sha256').update(buf).digest('hex');
  if (sum !== entry.sha256) throw Error('fixture changed (sha256 differs from the manifest): ' + rel);
  cache.set(rel, buf);
  return buf;
}
const json = (rel) => JSON.parse(read(rel).toString('utf8'));

// Bench of recording v1 or v2: one Float64Array per column (empty cell = NaN), 'view' as strings ('C' cockpit).
function loadBench(v) {
  const key = 'bench:' + v;
  if (cache.has(key)) return cache.get(key);
  const lines = zlib
    .gunzipSync(read(`recordings/bench_${v}.csv.gz`))
    .toString('utf8')
    .trim()
    .split(/\r?\n/);
  const names = lines[0].split(',');
  const n = lines.length - 1;
  const cols = {};
  for (const k of names) cols[k] = k === 'view' ? new Array(n) : new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = lines[i + 1].split(',');
    for (let j = 0; j < names.length; j++) {
      const k = names[j];
      const x = r[j];
      if (k === 'view') cols[k][i] = x;
      else cols[k][i] = x === '' ? NaN : +x;
    }
  }
  cols.n = n;
  cols.name = v;
  cols.cockpit = Uint8Array.from(cols.view, (x) => (x === 'C' ? 1 : 0));
  cache.set(key, cols);
  return cols;
}

// Legacy 30 Hz replay of recording v1 or v2, gaps of up to 15 samples forward-filled (keys are not filled); the raw
// series are kept under .raw.
const FILL = 15;
function filled(series) {
  const out = series.slice();
  let last = null;
  let age = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === null) {
      age++;
      out[i] = age <= FILL ? last : null;
    } else {
      last = out[i];
      age = 0;
    }
  }
  return out;
}
function loadLegacy(v) {
  const key = 'legacy:' + v;
  if (cache.has(key)) return cache.get(key);
  const d = json(`recordings/replay_${v}.json`);
  const f = {};
  for (const k of Object.keys(d)) f[k] = ['t', 'maj', 'z', 'S', 'D'].includes(k) ? d[k] : filled(d[k]);
  f.raw = d;
  f.name = v;
  cache.set(key, f);
  return f;
}

module.exports = {
  manifest,
  read,
  json,
  loadBench,
  loadLegacy,
  crossCurve: () => json('recordings/cross-curve.json'),
  harnessMetrics: () => json('expected/harness-metrics.json'),
  adoptedSwitches: () => json('expected/adopted-switches.json').switches,
};
