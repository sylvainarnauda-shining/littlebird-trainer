'use strict';
// Replay engines of the flight analysis, ported for the fidelity tests (numbers only, no analysis archive needed):
//  - rotation replays on the bench series (roll windows, the protocol of the adopted M5 figure);
//  - the legacy attitude-forced dense replay and the named segments on the 30 Hz series (M10, M11);
//  - the chase-camera heading lag (M6) and the HUD attitude convention.
// createReplay({T, Flight}) binds them to three.js and to the trainer's own Flight class, as the analysis did when it
// scored the adopted model. Expression text and loop order are kept from the analysis so its figures reproduce.
const { loadBench, loadLegacy } = require('../../helpers/fixtures');

const DEG = Math.PI / 180;
// v1 0-390 s in 13 blocks, v2 0-150 s in 5 blocks (the partial last block is merged).
const BLOCKS = { v1: 13, v2: 5 };
const blockOf = (v, t) => Math.min(BLOCKS[v] - 1, Math.floor(t / 30));
const blockId = (v, t) => (v === 'v1' ? 0 : BLOCKS.v1) + blockOf(v, t);
const NBLOCK = BLOCKS.v1 + BLOCKS.v2;

// Centred local-regression slope over finite samples (window win seconds).
function deriv(x, t, win) {
  const n = x.length;
  const out = new Float64Array(n).fill(NaN);
  const idx = [];
  for (let i = 0; i < n; i++) if (Number.isFinite(x[i])) idx.push(i);
  const m = idx.length;
  const c1 = new Float64Array(m + 1);
  const c2 = new Float64Array(m + 1);
  const cx = new Float64Array(m + 1);
  const cxt = new Float64Array(m + 1);
  for (let k = 0; k < m; k++) {
    const tt = t[idx[k]];
    const xx = x[idx[k]];
    c1[k + 1] = c1[k] + tt;
    c2[k + 1] = c2[k] + tt * tt;
    cx[k + 1] = cx[k] + xx;
    cxt[k + 1] = cxt[k] + xx * tt;
  }
  const ts = idx.map((i) => t[i]);
  const lb = (v) => {
    let a = 0;
    let b = m;
    while (a < b) {
      const c = (a + b) >> 1;
      if (ts[c] < v) a = c + 1;
      else b = c;
    }
    return a;
  };
  const ub = (v) => {
    let a = 0;
    let b = m;
    while (a < b) {
      const c = (a + b) >> 1;
      if (ts[c] <= v) a = c + 1;
      else b = c;
    }
    return a;
  };
  for (let k = 0; k < m; k++) {
    const lo = lb(ts[k] - win / 2);
    const hi = ub(ts[k] + win / 2);
    const nn = hi - lo;
    const st = c1[hi] - c1[lo];
    const stt = c2[hi] - c2[lo];
    const sx = cx[hi] - cx[lo];
    const sxt = cxt[hi] - cxt[lo];
    const den = nn * stt - st * st;
    if (nn >= 4 && den > 1e-9) out[idx[k]] = (nn * sxt - st * sx) / den;
  }
  return out;
}

// Centred moving average over finite samples (at least 2 and 30 % of the window).
function smooth(x, t, win) {
  const n = x.length;
  const out = new Float64Array(n).fill(NaN);
  let lo = 0;
  let hi = 0;
  let s = 0;
  let c = 0;
  for (let i = 0; i < n; i++) {
    while (hi < n && t[hi] <= t[i] + win / 2) {
      if (Number.isFinite(x[hi])) {
        s += x[hi];
        c++;
      }
      hi++;
    }
    while (t[lo] < t[i] - win / 2) {
      if (Number.isFinite(x[lo])) {
        s -= x[lo];
        c--;
      }
      lo++;
    }
    const tot = hi - lo;
    if (c >= Math.max(2, 0.3 * tot)) out[i] = s / c;
  }
  return out;
}

function createReplay({ T, Flight }) {
  // Attitude quaternion from HUD heading (deg, clockwise), pitch (nose up +), bank (right +).
  function quatFromHud(h, p, b, out = new T.Quaternion()) {
    return out.setFromEuler(new T.Euler(p * DEG, -h * DEG, -b * DEG, 'YXZ'));
  }
  // Chase-camera heading lag (time constant tau), applied per physics step.
  function chaseYawStep(cam, flight, dt, tau = 0.3) {
    const nose = new T.Vector3(0, 0, -1).applyQuaternion(flight.quaternion);
    const yaw = Math.hypot(nose.x, nose.z) > 1e-3 ? Math.atan2(-nose.x, -nose.z) : cam.yaw;
    if (cam.yaw === undefined || !dt) cam.yaw = yaw;
    else cam.yaw += Math.atan2(Math.sin(yaw - cam.yaw), Math.cos(yaw - cam.yaw)) * (1 - Math.exp(-dt / tau));
    return cam.yaw;
  }

  // ---- rotation replays on the bench (fit_roll protocol) ----
  const rot = {};
  function rotSignals(v) {
    if (rot[v]) return rot[v];
    const d = loadBench(v);
    const t = d.t;
    return (rot[v] = {
      d,
      bankRate: deriv(d.bank, t, 0.15),
      yawRate: deriv(d.heading, t, 0.2),
      bankS: smooth(d.bank, t, 0.15),
    });
  }
  // 2 s windows every 0.5 s containing roll input, > 90 % finite, |bank| < 75.
  function rollWindows() {
    const out = [];
    for (const v of ['v1', 'v2']) {
      const s = rotSignals(v);
      const d = s.d;
      const bank = smooth(d.bank, d.t, 0.08);
      const n = 120;
      for (let i = 0; i + n < d.n; i += 30) {
        let ok = 0;
        let inp = 0;
        let mx = 0;
        for (let j = i; j < i + n; j++) {
          if (Number.isFinite(s.bankRate[j]) && Number.isFinite(bank[j])) ok++;
          inp += Math.abs(d.ClicD[j] - d.ClicG[j]);
          if (Number.isFinite(bank[j])) mx = Math.max(mx, Math.abs(bank[j]));
        }
        if (ok / n > 0.9 && Number.isFinite(s.bankRate[i]) && Number.isFinite(bank[i]) && inp > 0 && mx < 75)
          out.push({ v, i0: i, i1: i + n, block: blockId(v, d.t[i]), bank0: bank[i] });
      }
    }
    return out;
  }
  // Rotation-only run of the Flight from a recorded attitude; returns per-frame model rates.
  function simRotation(
    cfg,
    d,
    i0,
    i1,
    { roll0 = 0, yaw0 = 0, keys, observe = 'bank', camera = false, translate = false } = {},
  ) {
    const f = new Flight(cfg, () => 0);
    f.reset(5000);
    const h0 = Number.isFinite(d.heading_f[i0]) ? d.heading_f[i0] : 0;
    const p0 = Number.isFinite(d.pitch_f[i0]) ? d.pitch_f[i0] : 0;
    const b0 = Number.isFinite(d.bank_f[i0]) ? d.bank_f[i0] : 0;
    quatFromHud(h0, p0, b0, f.quaternion);
    if (translate) {
      const sp = (d.spd_kmh[i0] || 0) / 3.6;
      const h = h0 * DEG;
      f.velocity.set(sp * Math.sin(h), 0, -sp * Math.cos(h));
    }
    // Initial body rates from the measured rates (roll: -bank rate about +z; yaw: heading rate clockwise = -y).
    const w = new T.Vector3(0, -yaw0 * DEG, -roll0 * DEG);
    f.angular.copy(w);
    f.cyclic.copy(w);
    const cam = {};
    chaseYawStep(cam, f, 0);
    cam.yaw += yaw0 * DEG * 0.3; // camera in steady state behind a turning airframe (lag 0.30 s)
    const out = new Float64Array(i1 - i0);
    let prevB = f.attitude().bank;
    let prevH = f.attitude().heading;
    let prevC = cam.yaw;
    for (let i = i0; i < i1; i++) {
      const k = keys(i);
      for (let s = 0; s < 2; s++) {
        f.step(1 / 120, { pitch: k.pitch || 0, yaw: k.yaw || 0, roll: k.roll || 0, collective: 0 });
        if (!translate) f.velocity.set(0, 0, 0);
        chaseYawStep(cam, f, 1 / 120);
        f.position.y = 5000;
        f.onGround = false;
      }
      const a = f.attitude();
      if (observe === 'bank') {
        out[i - i0] = (a.bank - prevB) * 60;
        prevB = a.bank;
      } else if (camera && d.view[i] === 'X') {
        const dh = -(cam.yaw - prevC) / DEG;
        out[i - i0] = dh * 60;
        prevC = cam.yaw;
        prevH = a.heading;
      } else {
        let dh = a.heading - prevH;
        if (dh > 180) dh -= 360;
        if (dh < -180) dh += 360;
        out[i - i0] = dh * 60;
        prevH = a.heading;
        prevC = cam.yaw;
      }
    }
    return out;
  }
  function evalRoll(cfg, windows) {
    let e = 0;
    let n = 0;
    for (const w of windows) {
      const s = rotSignals(w.v);
      const d = s.d;
      const m = simRotation(cfg, d, w.i0, w.i1, {
        roll0: s.bankRate[w.i0],
        keys: (i) => ({ roll: (d.ClicG[i] > 0 ? 1 : 0) - (d.ClicD[i] > 0 ? 1 : 0) }),
      });
      // Model rate over [i, i+1] against the measured rate at i + 1/2 (mean of i and i+1).
      for (let i = w.i0; i < w.i1; i++) {
        const r = s.bankRate[i];
        if (!Number.isFinite(r)) continue;
        const k = i - w.i0;
        const mm = k === 0 ? s.bankRate[w.i0] : 0.5 * (m[k - 1] + m[Math.min(k, m.length - 1)]);
        const z = mm - r;
        e += z * z;
        n++;
      }
    }
    return { rms: Math.sqrt(e / n), n, windows: windows.length };
  }

  // ---- legacy protocols on the 30 Hz series (dense replay, named segments) ----
  function legacyValid(d, i0, per) {
    for (let i = i0; i < i0 + per; i++) {
      if (
        [d.bank[i], d.pitch[i], d.heading[i], d.arc[i]].some((x) => x === null) ||
        (d.agl[i] !== null && d.agl[i] < 8) ||
        Math.abs(d.bank[i]) > 70 ||
        (d.maj[i] && d.agl[i] !== null && d.agl[i] < 15)
      )
        return false;
    }
    if (d.spd[i0] === null || d.vs[i0] === null) return false;
    if (Math.abs(d.heading[i0 + per - 1] - d.heading[i0]) > 400) return false;
    return true;
  }
  function legacyTags(d, i) {
    const r = d.raw;
    const t = [];
    const kmh = (r.spd[i] ?? d.spd[i]) * 3.6;
    t.push(kmh < 20 ? 'hover<20' : kmh < 100 ? 'low20-100' : kmh < 180 ? 'mid100-180' : 'cruise>=180');
    const b = Math.abs(d.bank[i]);
    const vs = r.vs[i] ?? 0;
    const p = d.pitch[i];
    t.push(b > 20 ? 'turn' : 'wingsLevel');
    if (vs > 2.5) t.push('climb');
    else if (vs < -2.5) t.push('descent');
    else t.push('levelish');
    if (p > 5 && kmh > 60) t.push('flare');
    return t;
  }
  function legacyDense(cfg, { substeps = 1, stepWin = 30, leverForced = false } = {}) {
    const DT = 1 / 30;
    const per = 180;
    const stats = new Map();
    const put = (k, e) => {
      let a = stats.get(k);
      if (!a) {
        a = { n: 0, s: 0, s2: 0 };
        stats.set(k, a);
      }
      a.n++;
      a.s += e;
      a.s2 += e * e;
    };
    let windows = 0;
    const f = new Flight(cfg);
    for (const v of ['v1', 'v2']) {
      const d = loadLegacy(v);
      const r = d.raw;
      for (let i0 = 0; i0 + per < d.t.length; i0 += stepWin) {
        if (!legacyValid(d, i0, per)) continue;
        windows++;
        f.reset(5000);
        const h = d.heading[i0] * DEG;
        const g = Math.asin(Math.max(-1, Math.min(1, d.vs[i0] / Math.max(d.spd[i0], 0.5))));
        const vh = d.spd[i0] * Math.cos(g);
        f.velocity.set(vh * Math.sin(h), d.spd[i0] * Math.sin(g), -vh * Math.cos(h));
        f.collective = d.arc[i0];
        f.verticalAccel = 0;
        let alt = 0;
        const asl0 = r.asl[i0];
        for (let i = i0; i < i0 + per; i++) {
          const k = i - i0;
          const hb = k < 60 ? '0-2s' : k < 120 ? '2-4s' : '4-6s';
          const tg = ['ALL', ...legacyTags(d, i), 'h ' + hb, v];
          if (r.arc[i] !== null) for (const t of tg) put(t + '|lever', f.collective - r.arc[i]);
          if (r.vs[i] !== null) for (const t of tg) put(t + '|vs', f.velocity.y - r.vs[i]);
          if (r.spd[i] !== null) for (const t of tg) put(t + '|spd', f.velocity.length() - r.spd[i]);
          if (r.asl[i] !== null && asl0 !== null) for (const t of tg) put(t + '|dalt', alt - (r.asl[i] - asl0));
          f.quaternion.copy(quatFromHud(d.heading[i], d.pitch[i], d.bank[i]));
          f.angular.set(0, 0, 0);
          f.cyclic.set(0, 0, 0);
          f.mouseRate.set(0, 0, 0);
          const pn = d.pitch[Math.min(i + 1, d.t.length - 1)] ?? d.pitch[i];
          f.ffPitchRate = ((pn - (d.pitch[Math.max(i - 1, 0)] ?? d.pitch[i])) / (2 * DT)) * DEG;
          f.ffBank = d.bank[i];
          for (let s = 0; s < substeps; s++) {
            if (leverForced) f.collective = d.arc[i];
            f.step(DT / substeps, {
              pitch: 0,
              yaw: 0,
              roll: 0,
              collective: leverForced ? 0 : d.maj[i] ? -1 : d.z[i] ? 1 : 0,
            });
            alt += (f.velocity.y * DT) / substeps;
          }
          f.position.y = 5000;
          f.onGround = false;
        }
      }
    }
    const out = { windows };
    for (const [k, a] of stats)
      out[k] = { n: a.n, rms: +Math.sqrt(a.s2 / a.n).toFixed(3), bias: +(a.s / a.n).toFixed(3) };
    return out;
  }
  // Continuous attitude-forced replay of one named segment.
  function namedSegment(cfg, v, t0, t1, { substeps = 1 } = {}) {
    const d = loadLegacy(v);
    const DT = 1 / 30;
    const fill = (k) => {
      let last = null;
      return d.raw[k].map((x) => (x === null ? last : (last = x)));
    };
    const bank = fill('bank');
    const pitch = fill('pitch');
    const heading = fill('heading');
    const raw = d.raw;
    const i0 = raw.t.findIndex((t) => t >= t0);
    const i1 = raw.t.findIndex((t) => t >= t1);
    const f = new Flight(cfg);
    f.reset(5000);
    const h = heading[i0] * DEG;
    const g = Math.asin(Math.max(-1, Math.min(1, raw.vs[i0] / Math.max(raw.spd[i0], 0.5))));
    const vh = raw.spd[i0] * Math.cos(g);
    f.velocity.set(vh * Math.sin(h), raw.spd[i0] * Math.sin(g), -vh * Math.cos(h));
    f.collective = raw.arc[i0] ?? 0;
    let alt = 0;
    const a0 = raw.asl[i0];
    let s2 = 0;
    let n = 0;
    let l2 = 0;
    let ln = 0;
    let lastRec = null;
    for (let i = i0; i < i1; i++) {
      if (raw.vs[i] !== null) {
        s2 += (f.velocity.y - raw.vs[i]) ** 2;
        n++;
      }
      if (raw.arc[i] !== null) {
        l2 += (f.collective - raw.arc[i]) ** 2;
        ln++;
      }
      if (raw.asl[i] !== null && a0 !== null) lastRec = { t: raw.t[i], rec: raw.asl[i] - a0, mod: alt };
      f.quaternion.copy(quatFromHud(heading[i], pitch[i], bank[i]));
      f.angular.set(0, 0, 0);
      f.cyclic.set(0, 0, 0);
      f.mouseRate.set(0, 0, 0);
      f.ffPitchRate = ((pitch[Math.min(i + 1, i1)] - pitch[Math.max(i - 1, i0)]) / (2 * DT)) * DEG;
      f.ffBank = bank[i];
      for (let s = 0; s < substeps; s++) {
        f.step(DT / substeps, { pitch: 0, yaw: 0, roll: 0, collective: raw.maj[i] ? -1 : raw.z[i] ? 1 : 0 });
        alt += (f.velocity.y * DT) / substeps;
      }
      f.position.y = 5000;
      f.onGround = false;
    }
    return {
      v,
      t0,
      t1,
      game_dalt: lastRec && +lastRec.rec.toFixed(1),
      model_dalt: lastRec && +lastRec.mod.toFixed(1),
      err_dalt: lastRec && +(lastRec.mod - lastRec.rec).toFixed(1),
      vs_rms: +Math.sqrt(s2 / n).toFixed(2),
      lever_rms: +Math.sqrt(l2 / Math.max(ln, 1)).toFixed(3),
    };
  }
  const NAMED = [
    ['v1', 238, 249],
    ['v1', 116, 127],
    ['v1', 158, 164],
    ['v1', 42, 45],
    ['v2', 148, 158],
  ];
  const namedSegments = (cfg, opts) => NAMED.map(([v, a, b]) => namedSegment(cfg, v, a, b, opts));

  return {
    quatFromHud,
    chaseYawStep,
    rotSignals,
    rollWindows,
    simRotation,
    evalRoll,
    legacyDense,
    namedSegment,
    namedSegments,
    NAMED,
  };
}

module.exports = { DEG, NBLOCK, blockId, deriv, smooth, createReplay };
