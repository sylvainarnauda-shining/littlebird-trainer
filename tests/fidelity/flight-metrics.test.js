'use strict';
// Flight feel of physics.js and its shared input path against the adopted analysis figures (checks F14-F21): the
// trainer's own Flight runs in the analysis replay engines (tests/fidelity/lib/replay.js), with both mouse laws:
// the measured rate law (default) and the v12 virtual stick (compatibility option). Each adopted metric must reproduce
// the analysis figure (tests/fixtures/expected/harness-metrics.json), the targets it met stay met, and nothing
// regresses beyond the analysis tolerance. The step-for-step equalities with the frozen v12 code and the analysis
// candidate are covered by the flight goldens (tests/regression, G01/G02).
// Fixtures: recordings/cross-curve.json (43 mouse crossings), bench_v{1,2}.csv.gz, replay_v{1,2}.json.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');
const { crossCurve, harnessMetrics } = require('../helpers/fixtures');
const { lcg } = require('../helpers/rng');
const { DEG, deriv, createReplay } = require('./lib/replay');

const T = load('vendor/three.min.js');
const L = load('physics.js');
const R = createReplay({ T, Flight: L.Flight });
const HM = harnessMetrics();
const flat = () => 0;

// Trainer configurations: the defaults (measured rate law), and the same physics.js with every v13 switch at its v12
// value (v12 virtual stick, v12 yaw lags, hover lever 0).
const V13 = () => ({ ...L.defaults });
const V12 = () => ({
  ...L.defaults,
  mouseLaw: 'stick',
  cyclicYaw: null,
  responseYaw: null,
  leverHover: 0,
  chaseSpeedView: false,
});
// measured: the mouse gain of the reference recordings (sensitivity x multiplier: pitch 0.08, yaw 0.04, inverted
// vertical axis), written as sensitivities doubled with the multiplier halved. The products are the same bit for bit in
// both mouse laws (a factor of 2 changes no rounding), so the replays reproduce the analysis exactly.
const REC = Object.freeze({ pitchSens: 32, yawSens: 16, vehicleMultiplier: 0.25, invertY: true });

// ---------- M1/M3: mouse crossings through the trainer input path ----------
const G = crossCurve();
const GT = G.t;
const EV = [...Array(G.speeds.length).keys()];
const gameRow = (k) => G.Q[k].map((x) => (x === null ? NaN : x));
const NFR = G.speeds.map((s) => Math.round((95 * 60) / s));
const DT = 1 / 120;
// Steps the frame loop runs from accumulator acc (the app passes this count to frameStart).
const stepsIn = (acc) => {
  let n = 0;
  for (let a = acc; a >= DT - 1e-12; a -= DT) n++;
  return n;
};
// Swipe generator (hypothesis 'T 0.25-1.1 s', seed 12) run through physics.js mouseMove / frameStart / inputStep.
function swipePool(Tlo, Thi, seed, perNfr = 30) {
  const r = lcg(seed);
  const need = new Set(NFR);
  const pool = {};
  for (const n of need) pool[n] = [];
  let tries = 0;
  while (tries++ < 400000 && [...need].some((n) => pool[n].length < perNfr)) {
    const d0 = 60 + r() * 480;
    const D = d0 + 40 + r() * 260;
    const Tt = Tlo + r() * (Thi - Tlo);
    const ns = Math.max(2, Math.round(Tt / DT));
    const vel = [];
    for (let i = 0; i < Math.round(0.8 / DT); i++) vel.push(0);
    for (let i = 0; i < ns; i++) {
      const tt = i / ns;
      vel.push((D * 30 * tt * tt * (1 - tt) * (1 - tt)) / Tt);
    }
    for (let i = 0; i < Math.round(1.8 / DT); i++) vel.push(0);
    const pos = [];
    let p = 0;
    for (const v of vel) {
      p += v * DT;
      pos.push(p);
    }
    const a = pos.findIndex((x) => x >= d0 - 47.5);
    const b = pos.findIndex((x) => x >= d0 + 47.5);
    if (a < 0 || b < 0 || b <= a) continue;
    const nfr = Math.max(1, Math.round((b - a) * DT * 60));
    if (!need.has(nfr) || pool[nfr].length >= perNfr) continue;
    pool[nfr].push({ pos, tc: ((a + b) / 2) * DT, phase: r() * 0.01 });
  }
  return pool;
}
function swipeResponse(cfg, sw) {
  const f = new L.Flight(cfg, flat);
  f.reset(500);
  const s = L.createInputState();
  const dur = sw.pos.length * DT;
  const posAt = (t) => {
    const x = t / DT - 1;
    if (x <= 0) return 0;
    const i = Math.floor(x);
    if (i >= sw.pos.length - 1) return sw.pos[sw.pos.length - 1];
    return sw.pos[i] + (sw.pos[i + 1] - sw.pos[i]) * (x - i);
  };
  const ts = [0];
  const ps = [0];
  let acc = 0;
  let sent = 0;
  let t = 0;
  let tf = sw.phase;
  while (tf < dur) {
    const target = posAt(tf);
    const dy = Math.round(target - sent);
    sent += dy;
    if (dy) L.mouseMove(s, cfg, 0, dy);
    acc += 0.01;
    L.frameStart(s, cfg, 0.01, stepsIn(acc));
    while (acc >= DT - 1e-12) {
      f.step(DT, L.inputStep(s, cfg, {}, DT));
      acc -= DT;
      t += DT;
      ts.push(t);
      ps.push(f.attitude().pitch);
    }
    tf += 0.01;
  }
  const tt = GT.map((g) => sw.tc + g);
  const pp = tt.map((x) => {
    const i = Math.min(ts.length - 2, Math.max(0, Math.floor(x / DT)));
    return ps[i] + ((ps[i + 1] - ps[i]) * (x - ts[i])) / DT;
  });
  return Array.from(deriv(Float64Array.from(pp), Float64Array.from(GT), 0.1));
}
function curves(cfg, pool) {
  const by = {};
  for (const [n, list] of Object.entries(pool)) {
    const acc = new Float64Array(GT.length);
    const cnt = new Float64Array(GT.length);
    const all = [];
    for (const sw of list) {
      const c = swipeResponse(cfg, sw);
      all.push(c);
      c.forEach((x, i) => {
        if (Number.isFinite(x)) {
          acc[i] += x;
          cnt[i]++;
        }
      });
    }
    by[n] = { mean: Array.from(acc, (x, i) => x / cnt[i]), all };
  }
  return by;
}
function meanOver(ev, fn) {
  const acc = new Float64Array(GT.length);
  const cnt = new Float64Array(GT.length);
  for (const k of ev) {
    fn(k).forEach((x, i) => {
      if (Number.isFinite(x)) {
        acc[i] += x;
        cnt[i]++;
      }
    });
  }
  return Array.from(acc, (x, i) => (cnt[i] ? x / cnt[i] : NaN));
}
function rmsDiff(a, b) {
  let s = 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
      s += (a[i] - b[i]) ** 2;
      n++;
    }
  }
  return Math.sqrt(s / n);
}
function peakOf(c) {
  let k = 0;
  for (let i = 0; i < c.length; i++) if (c[i] > c[k]) k = i;
  return { peak: +c[k].toFixed(2), peak_t: +GT[k].toFixed(3) };
}
function p99(vals) {
  const a = vals
    .filter(Number.isFinite)
    .map(Math.abs)
    .sort((x, y) => x - y);
  return +a[Math.floor(0.99 * (a.length - 1))].toFixed(2);
}

// ---------- model-side metric functions ----------
function make(cfg, h = 500) {
  const f = new L.Flight(cfg, flat);
  f.reset(h);
  return f;
}
function run(f, input, s, cb) {
  for (let i = 0; i < Math.round(s * 120); i++) {
    f.step(1 / 120, { pitch: 0, yaw: 0, roll: 0, collective: 0, ...input });
    cb?.(f, i / 120);
  }
}
function turnRatio(cfg, kmh) {
  const f = make(cfg);
  const v = kmh / 3.6;
  f.velocity.set(0, 0, -v);
  f.quaternion.setFromEuler(new T.Euler(-Math.atan((0.0003 * v * v) / 9.81), 0, 0, 'YXZ'));
  f.collective = cfg.leverHover || 0;
  run(f, {}, 2);
  run(f, { roll: -1 }, 0.4);
  run(f, {}, 0.6);
  const a = f.attitude().heading;
  let co = 0;
  let n = 0;
  run(f, {}, 3, (g) => {
    co += (9.81 * Math.tan(g.attitude().bank * DEG)) / g.velocity.length() / DEG;
    n++;
  });
  let d = f.attitude().heading - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return +(d / 3 / (co / n)).toFixed(3);
}
function levelTrim(cfg) {
  const rows = [];
  for (const deg of [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 8.5, 9, 10, 11, 12]) {
    const f = make(cfg);
    f.quaternion.setFromEuler(new T.Euler(-deg * DEG, 0, 0, 'YXZ'));
    f.collective = cfg.leverHover || 0;
    run(f, {}, 90);
    rows.push({ pitch: -deg, kmh: f.velocity.length() * 3.6 });
  }
  const at = (k) => {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].kmh >= k && rows[i - 1].kmh < k) {
        const a = rows[i - 1];
        const b = rows[i];
        return +(a.pitch + ((b.pitch - a.pitch) * (k - a.kmh)) / (b.kmh - a.kmh)).toFixed(2);
      }
    }
    return null;
  };
  return { p27: at(27), p55: at(55), p235: at(235) };
}
function collectiveSteps(cfg) {
  const out = {};
  for (const [k, c] of [
    ['Z_1s', 1],
    ['Maj_1s', -1],
  ]) {
    const f = make(cfg);
    f.collective = cfg.leverHover || 0;
    run(f, {}, 1);
    run(f, { collective: c }, 1);
    run(f, {}, 1);
    out[k + '_vs_at_2s'] = +f.velocity.y.toFixed(2);
  }
  const z = make(cfg);
  run(z, { collective: 1 }, 5);
  out.Z_5s_vs = +z.velocity.y.toFixed(2);
  const m = make(cfg);
  run(m, { collective: -1 }, 5);
  out.Maj_5s_vs = +m.velocity.y.toFixed(2);
  const h = make(cfg);
  h.collective = 0.3;
  run(h, {}, 30);
  out.hover_lever_after_30s = +h.collective.toFixed(3);
  out.hover_lever_at_reset = make(cfg).collective;
  out.down_rate = cfg.collectiveDownRate;
  return out;
}
function dFromHover(cfg, times = [0.73, 1.47]) {
  const f = make(cfg);
  const cam = {};
  R.chaseYawStep(cam, f, 0);
  const h0 = f.attitude().heading;
  const c0 = cam.yaw;
  const out = {};
  let t = 0;
  while (t < Math.max(...times) + 1e-9) {
    f.step(1 / 120, { pitch: 0, yaw: -1, roll: 0, collective: 0 });
    R.chaseYawStep(cam, f, 1 / 120);
    t += 1 / 120;
    for (const x of times) {
      if (Math.abs(t - x) < 1 / 240) {
        const a = f.attitude().heading - h0;
        out[x] = { airframe: +a.toFixed(2), chase: +(-(cam.yaw - c0) / DEG).toFixed(2) };
      }
    }
  }
  return out;
}
function rollTap(cfg) {
  const f = make(cfg);
  run(f, { roll: 1 }, 0.1);
  run(f, {}, 2);
  return +Math.abs(f.attitude().bank).toFixed(2);
}
// Nose after a swipe: px pixels in T0 seconds, 100 Hz frames, hover.
function afterSwipe(cfg, px, T0) {
  const f = make(cfg);
  const s = L.createInputState();
  let acc = 0;
  let sent = 0;
  let t = 0;
  let stopAt = null;
  let still = null;
  const p0 = f.attitude().pitch;
  const n = Math.round(T0 / 0.01);
  for (let fr = 0; fr < 500; fr++) {
    const dy = fr < n ? Math.round((px * (fr + 1)) / n - sent) : 0;
    sent += dy;
    if (dy) L.mouseMove(s, cfg, 0, dy);
    if (fr === n) stopAt = t;
    acc += 0.01;
    L.frameStart(s, cfg, 0.01, stepsIn(acc));
    while (acc >= DT - 1e-12) {
      f.step(DT, L.inputStep(s, cfg, {}, DT));
      acc -= DT;
      t += DT;
    }
    if (stopAt !== null && still === null && Math.abs(f.angular.x / DEG) < 1) still = t - stopAt;
  }
  return { angle_deg: +(f.attitude().pitch - p0).toFixed(1), stop_s: still === null ? Infinity : +still.toFixed(2) };
}

test('F14 mouse crossings (43): rate law rms <= 3 deg/s, peak 0.22 +- 0.05 s, p99 <= 30; analysis figures reproduced (v12 stick 17.11)', () => {
  const pool = swipePool(0.25, 1.1, 12);
  const g = meanOver(EV, gameRow);
  const out = {};
  for (const [name, cfg] of [
    ['v12', { ...V12(), ...REC }],
    ['v13', { ...V13(), ...REC }],
  ]) {
    const cc = curves(cfg, pool);
    const m = meanOver(EV, (k) => cc[NFR[k]].mean);
    out[name] = { rms: +rmsDiff(m, g).toFixed(2), ...peakOf(m), p99: p99(EV.flatMap((k) => cc[NFR[k]].all.flat())) };
  }
  const M1 = HM.M1_mouse_crossings;
  assert.ok(Math.abs(out.v12.rms - M1.v12.rms) < 0.05, 'the v12 stick reproduces the analysis: ' + out.v12.rms);
  assert.ok(out.v13.rms <= 3 && Math.abs(out.v13.peak_t - 0.22) <= 0.05, 'M1 met: ' + JSON.stringify(out.v13));
  assert.ok(Math.abs(out.v13.rms - M1.candidate.rms) < 0.05, 'analysis figure reproduced: ' + out.v13.rms);
  assert.ok(out.v13.p99 <= 30, 'M3 met: ' + out.v13.p99);
  assert.ok(Math.abs(out.v13.p99 - HM.M3_mouse_p99.candidate) < 0.1, 'M3 analysis figure reproduced: ' + out.v13.p99);
});

// chosen: the mouse gain this check has always run with (sensitivity x multiplier: pitch 0.1, yaw 0.05, inverted
// vertical axis), stated here so that it does not follow the public defaults.
const SWIPE_GAIN = Object.freeze({ pitchSens: 40, yawSens: 20, vehicleMultiplier: 0.25, invertY: true });
test('F15 the nose stops within 1.5 s after a swipe with the rate law; the v12 stick keeps turning more than 2 s', () => {
  const v13 = afterSwipe({ ...V13(), ...SWIPE_GAIN }, 400, 0.3);
  const v12 = afterSwipe({ ...V12(), ...SWIPE_GAIN }, 400, 0.3);
  assert.ok(v13.stop_s < 1.5, 'rate law: the nose stops within 1.5 s: ' + v13.stop_s);
  assert.ok(v12.stop_s > 2, 'v12 stick keeps turning more than 2 s: ' + v12.stop_s);
});

test('F16 roll replay on the bench windows (rms <= 7.8705) and a 0.1 s click (5.4-9 deg), unchanged from v12', () => {
  const windows = R.rollWindows();
  assert.equal(windows.length, 467, 'roll windows');
  const o = {};
  for (const [n, cfg] of [
    ['v12', V12()],
    ['v13', V13()],
  ])
    o[n] = { rms: +R.evalRoll(cfg, windows).rms.toFixed(3), tap: rollTap(cfg) };
  assert.ok(o.v13.rms <= 7.8705 && o.v13.tap >= 5.4 && o.v13.tap <= 9, 'M5: ' + JSON.stringify(o.v13));
  assert.ok(Math.abs(o.v13.rms - o.v12.rms) < 1e-6, 'roll unchanged');
});

test('F17 heading after D from hover, chase camera 0.30 s: 7.5 +- 1.5 deg at 0.73 s, 31.6 +- 2.5 at 1.47 s (analysis +- 0.02)', () => {
  const v13 = dFromHover(V13());
  const h = HM.candidate.M6_yaw_chase_from_hover;
  assert.ok(
    Math.abs(v13['0.73'].chase - h['0.73'].chase) < 0.02 && Math.abs(v13['1.47'].chase - h['1.47'].chase) < 0.02,
    'analysis figures reproduced: ' + JSON.stringify(v13),
  );
  assert.ok(Math.abs(v13['0.73'].chase - 7.5) <= 1.5, '0.73 s within tolerance');
  assert.ok(Math.abs(v13['1.47'].chase - 31.6) <= 2.5, '1.47 s within 31.6 +- 2.5: ' + v13['1.47'].chase);
});

test('F18 turn ratio by speed (reported, not adopted): unchanged from v12 within 0.01', () => {
  for (const k of [40, 80, 125, 175, 230]) {
    const a = turnRatio(V12(), k);
    const b = turnRatio(V13(), k);
    assert.ok(Math.abs(b - a) < 0.01, `unchanged at ${k} km/h: ${a} -> ${b}`);
  }
});

test('F19 collective: hover lever -0.14 +- 0.04 (reset -0.14), down rate 1/s, Z/Shift 5 s limits within 0.3 m/s of v12', () => {
  const v12 = collectiveSteps(V12());
  const v13 = collectiveSteps(V13());
  assert.ok(Math.abs(v13.hover_lever_after_30s + 0.14) <= 0.04 && v13.hover_lever_at_reset === -0.14, 'hover lever');
  assert.equal(v13.down_rate, 1, 'collectiveDownRate not adopted');
  assert.ok(
    Math.abs(v13.Z_5s_vs - v12.Z_5s_vs) < 0.3 && Math.abs(v13.Maj_5s_vs - v12.Maj_5s_vs) < 0.3,
    'limits at lever +-1 kept',
  );
});

test('F20 dense replay (1/120 s) reproduces the analysis VS and 4-6 s altitude (1e-3), beats v12, cruise speed <= 1.2; named segments within tolerance', () => {
  const o = {};
  for (const [n, cfg] of [
    ['v12', V12()],
    ['v13', V13()],
  ]) {
    const Ld = R.legacyDense({ ...cfg, weathervane: 0 }, { substeps: 4 });
    o[n] = {
      vs: Ld['ALL|vs'].rms,
      dalt: Ld['h 4-6s|dalt'].rms,
      cruise: Ld['cruise>=180|spd'].rms,
      named: R.namedSegments({ ...cfg, weathervane: 0 }, { substeps: 4 }),
    };
  }
  const h = HM.candidate.M10_dense_legacy_1_120;
  assert.ok(
    Math.abs(o.v13.vs - h.vs.rms) < 1e-3 && Math.abs(o.v13.dalt - h.dalt_4_6s.rms) < 1e-3,
    'analysis figures reproduced: ' + JSON.stringify({ vs: o.v13.vs, dalt: o.v13.dalt }),
  );
  assert.ok(o.v13.vs < o.v12.vs && o.v13.dalt < o.v12.dalt, 'VS and 4-6 s altitude no worse than v12');
  assert.ok(o.v13.cruise <= 1.2, 'cruise speed S1 met');
  o.v12.named.forEach((r, i) => {
    const c = o.v13.named[i];
    assert.ok(
      Math.abs(c.err_dalt) <= Math.abs(r.err_dalt) + 1 && c.vs_rms <= r.vs_rms + 0.2,
      `named ${r.v} ${r.t0}-${r.t1} within the analysis tolerance`,
    );
  });
});

test('F21 level trim -8.5 +- 1 deg at 235 km/h; 27 and 55 km/h unchanged from v12 (within 0.05)', () => {
  const v12 = levelTrim(V12());
  const v13 = levelTrim(V13());
  for (const k of ['p27', 'p55', 'p235']) assert.ok(Math.abs(v13[k] - v12[k]) < 0.05, k);
  assert.ok(Math.abs(v13.p235 + 8.5) <= 1, '235 km/h met: ' + v13.p235);
});
