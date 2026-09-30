'use strict';
// G2a: flight and input-path goldens. physics.js (with world.js for the valley's ground) in a module realm; the input
// path (createInputState, mouseMove / mouseStick, frameStart, inputStep) driven exactly as app.js animate() drives it:
// frame time added to the accumulator, the frame's step count n handed to frameStart, then n steps of 1/120 s.
// Scripts: the two recordings' key timelines (60 Hz bench frames, seeded mouse bursts, as test-v13-feel's free run),
// a synthetic 60 s script with jittered frame times (the parity script, generator 'session-v1' below), a swipe set at
// 100 Hz from hover, the attitude-forced dense replay of the benches, the compatibility-mode stick, a take-off from
// the valley's helipad (ground contact), touchdowns on flat ground (a slide on the skids along x, along z and on the
// diagonal, then a lift-off; each crash threshold of physics.js approached from both sides: vertical speed, horizontal
// speed, tilt). Configurations are explicit objects (meta), not the defaults; their mouse settings are neutral values
// (chosen), not the recordings' own.
// Every step's state (flight fields and input state) goes into a running hash; its 16-hex digest is kept every 60
// steps (0.5 s) and the full digest at the end.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const { makeModuleRealm } = require('../harness.cjs');
const { Hasher, sample } = require('../canon.cjs');
const { FLIGHT, MOUSE } = require('../probe.cjs');

const DT = 1 / 120, DEG = Math.PI / 180;
const rng = seed => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
function loadBench(file) {
  const lines = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').trim().split(/\r?\n/), names = lines[0].split(','), n = lines.length - 1, cols = {};
  for (const k of names) cols[k] = k === 'view' ? new Array(n) : new Float64Array(n);
  for (let i = 0; i < n; i++) { const r = lines[i + 1].split(','); for (let j = 0; j < names.length; j++) { const k = names[j], x = r[j]; if (k === 'view') cols[k][i] = x; else cols[k][i] = x === '' ? NaN : +x; } }
  cols.n = n; return cols;
}
const keysAt = (d, i) => ({ rollLeft: d.ClicG[i] > 0, rollRight: d.ClicD[i] > 0, pitchUp: d.S[i] > 0, yawRight: d.D[i] > 0, yawLeft: d.Q_inf[i] > 0, collectiveDown: d.Maj[i] > 0, collectiveUp: d.Z_inf[i] > 0 });
// Parity script generator 'session-v1' (test-v13-feel session()): frame times 10 ms x (0.9-1.1), mouse bursts, key toggles.
function sessionV1(seconds, seed) {
  const r = rng(seed), frames = []; let t = 0, burst = 0, vx = 0, vy = 0; const keys = {}, names = ['pitchUp', 'pitchDown', 'yawLeft', 'yawRight', 'rollLeft', 'rollRight', 'collectiveUp', 'collectiveDown'];
  while (t < seconds) { const dt = .01 * (.9 + .2 * r()); t += dt; if (burst <= 0 && r() < .03) { burst = Math.floor(5 + r() * 40); vx = (r() - .5) * 60; vy = (r() - .5) * 60; }
    const ev = []; if (burst > 0) { burst--; const k = 1 + Math.floor(r() * 3); for (let j = 0; j < k; j++) ev.push([Math.round(vx * (.5 + r())), Math.round(vy * (.5 + r()))]); }
    if (r() < .02) { const n = names[Math.floor(r() * names.length)]; keys[n] = !keys[n]; } frames.push({ dt, ev, keys: { ...keys } }); }
  return frames;
}
function hashFrames(frames) { const h = new Hasher(); for (const f of frames) { h.num(f.dt); h.val(f.ev); h.val(f.keys); } return h.digest(); }

class Run {
  constructor(P, cfg, ground, height = 400) { this.P = P; this.cfg = cfg; this.f = new P.Flight(cfg, ground); this.f.reset(height); this.s = P.createInputState(); this.h = new Hasher(); this.steps = 0; this.checkpoints = []; this.samples = []; }
  after() {
    const f = this.f, h = this.h; for (const k of FLIGHT) h.val(f[k]); for (const k of MOUSE) h.num(this.s[k]); this.steps++;
    if (this.steps % 60 === 0) this.checkpoints.push(h.peek().slice(0, 16));
    if (this.steps % 600 === 0) this.samples.push({ step: this.steps, ...sample({ p: f.position.toArray(), v: f.velocity.toArray(), q: f.quaternion.toArray(), collective: f.collective }) });
  }
  // checkpointHex: the 16-hex digests one after another (checkpoint i = characters 16i..16i+15).
  result() { return { steps: this.steps, final: this.h.digest(), checkpointHex: this.checkpoints.join(''), samples: this.samples }; }
}
// app.js animate(): frames of dt, the frame's steps counted from the accumulator, frameStart(n), then the steps.
// setup(flight): the initial state, after reset (touchdowns); each(flight): after every step (read only).
function runFrames(P, cfg, frames, { ground, height = 400, compat = false, setup = null, each = null } = {}) {
  const r = new Run(P, cfg, ground, height), s = r.s; let acc = 0, ax = 0, ay = 0;
  if (setup) setup(r.f);
  for (const fr of frames) {
    for (const [dx, dy] of fr.ev) { if (compat) { ax += dx; ay += dy; P.mouseStick(s, cfg, ax, ay); } else P.mouseMove(s, cfg, dx, dy); }
    const dt = Math.min(fr.dt, .1); acc += dt; let n = 0; for (let a = acc; a >= DT; a -= DT) n++;
    P.frameStart(s, cfg, dt, n);
    while (acc >= DT) { r.f.step(DT, P.inputStep(s, cfg, fr.keys, DT, false, compat)); acc -= DT; r.after(); if (each) each(r.f); }
  }
  return r.result();
}
// test-v13-feel free run: one 60 Hz frame per bench row (frameStart with steps = true), 2 steps, seeded mouse bursts.
function freeRun(P, cfg, d, seed) {
  const r = new Run(P, cfg, () => 0, 400), s = r.s, rr = rng(seed); let burst = 0, vx = 0, vy = 0;
  for (let i = 0; i < d.n; i++) {
    const keys = keysAt(d, i); if (burst <= 0 && rr() < .02) { burst = Math.floor(3 + rr() * 20); vx = (rr() - .5) * 30; vy = (rr() - .5) * 30; }
    if (burst > 0) { burst--; P.mouseMove(s, cfg, Math.round(vx), Math.round(vy)); }
    P.frameStart(s, cfg, 1 / 60);
    for (let k = 0; k < 2; k++) { r.f.step(DT, P.inputStep(s, cfg, keys, DT)); r.after(); }
    if (r.f.position.y > 3000 || r.f.position.y < 50) r.f.position.y = 400;
  }
  return r.result();
}
// Swipe from hover at 100 Hz: `px` pixels over `T` s on one axis, then 3 s still.
function swipe(P, cfg, axis, px, T) {
  const frames = [], n = Math.round(T / .01); let sent = 0;
  for (let i = 0; i < n + 300; i++) { const want = i < n ? Math.round(px * (i + 1) / n) : px, d = want - sent; sent = want; frames.push({ dt: .01, ev: d ? [axis === 'x' ? [d, 0] : [0, d]] : [], keys: {} }); }
  return runFrames(P, cfg, frames, { ground: () => 0, height: 500 });
}
// Attitude-forced dense replay (test-v13-feel): windows of 720 bench rows every 240, attitude from the HUD readings.
function dense(P, T, cfg, d) {
  const r = new Run(P, { ...cfg, weathervane: 0 }, () => 0, 5000), f = r.f;
  for (let i0 = 0; i0 + 720 < d.n; i0 += 240) {
    f.reset(5000); const h = (d.heading_f[i0] || 0) * DEG, sp = (d.spd_kmh[i0] || 0) / 3.6, vs = d.vs[i0] || 0, g = Math.asin(Math.max(-1, Math.min(1, vs / Math.max(sp, .5)))), vh = sp * Math.cos(g);
    f.velocity.set(vh * Math.sin(h), sp * Math.sin(g), -vh * Math.cos(h)); f.collective = d.lever_f[i0] || 0; f.verticalAccel = 0;
    for (let i = i0; i < i0 + 720; i++) {
      f.quaternion.setFromEuler(new T.Euler((d.pitch_f[i] || 0) * DEG, -(d.heading_f[i] || 0) * DEG, -(d.bank_f[i] || 0) * DEG, 'YXZ')); f.angular.set(0, 0, 0); f.cyclic.set(0, 0, 0);
      const inp = { pitch: 0, yaw: 0, roll: 0, collective: d.Maj[i] ? -1 : d.Z_inf[i] ? 1 : 0 };
      for (let k = 0; k < 2; k++) { f.step(DT, inp); r.after(); }
      f.position.y = 5000; f.onGround = false;
    }
  }
  return r.result();
}
// Take-off from the valley's helipad (ground contact, then climb and a turn), 100 Hz.
function takeOff(P, cfg) {
  const frames = []; for (let i = 0; i < 3000; i++) frames.push({ dt: .01, ev: i > 900 && i % 3 === 0 ? [[2, -1]] : [], keys: { collectiveUp: i < 600, pitchDown: i >= 700 && i < 760, yawRight: i >= 1500 && i < 1700, rollLeft: i >= 2000 && i < 2040 } });
  const r = runFrames(P, cfg, frames, { ground: undefined, height: P.terrain(0, 130) + 1.25 });
  return r;
}
// Touchdown on flat ground at 100 Hz: the helicopter `above` m over its floor (skids 1.25 m under the reference point)
// with the given velocity (m/s) and attitude (deg), lever down for 2.5 s, then up for 1.5 s.
const TOUCHDOWNS = {
  'slide-x-8': { vx: 8, vy: -1.2, above: .3 }, 'slide-z-10': { vz: -10, vy: -1.5, above: .3 }, 'slide-diag-11.5': { vx: 8.131727983645296, vz: -8.131727983645296, vy: -1, above: .3 },
  'fast-13': { vz: -13, vy: -1, above: .3 }, 'hard-4.3': { vy: -4.3, above: .05 }, 'hard-4.8': { vy: -4.8, above: .05 },
  'tilt-25': { pitch: -25, vy: -1, above: .2 }, 'tilt-35': { pitch: -35, vy: -1, above: .2 }
};
function touchdown(P, T, cfg, { vx = 0, vy = 0, vz = 0, pitch = 0, roll = 0, above = .3 }) {
  const frames = []; for (let i = 0; i < 400; i++) frames.push({ dt: .01, ev: [], keys: { collectiveDown: i < 250, collectiveUp: i >= 250 } });
  const o = { touched: false, crashed: false, slide: 0, liftedOff: false }; let last = null;
  const r = runFrames(P, cfg, frames, { ground: () => 0, height: 1.25 + above, setup: f => { f.velocity.set(vx, vy, vz); f.quaternion.setFromEuler(new T.Euler(pitch * DEG, 0, roll * DEG, 'YXZ')); },
    each: f => { if (f.onGround) { o.touched = true; if (last) o.slide += Math.hypot(f.position.x - last.x, f.position.z - last.z); last = f.position.clone(); } else last = null; o.crashed = f.crashed; o.liftedOff = o.touched && !f.onGround && !f.crashed; } });
  o.slide = +o.slide.toFixed(3); return { ...r, outcome: o };
}

function configs(P) {
  // Explicit objects from the flight module's defaults, the view and memo settings made neutral (chosen, unused here).
  // Mouse settings: neutral values (chosen), one set with the inverted Y axis, one without; not the recordings' own.
  const D = { ...JSON.parse(JSON.stringify(P.defaults)), fovCockpit: 90, fovChase: 90, dpi: 1000 };
  const inv = { ...D, pitchSens: 30, yawSens: 15, vehicleMultiplier: .75, invertY: true, isolation: 0, mouseFine: 1 };
  return {
    'rate-inv': inv,
    'rate-alt': { ...D, pitchSens: 50, yawSens: 40, vehicleMultiplier: 1, invertY: false, isolation: .25, mouseFine: 1.2 },
    'stick-inv': { ...inv, mouseLaw: 'stick' },
    'v12': { ...inv, mouseLaw: 'stick', cyclicYaw: null, responseYaw: null, leverHover: 0, chaseSpeedView: false }
  };
}

async function record(rt, { golden = null, inputs, log = () => {} } = {}) {
  const realm = makeModuleRealm(rt, { files: ['world.js', 'physics.js'] }), P = realm.P, T = realm.THREE;
  const cfgs = golden ? golden.meta.configs : configs(P);
  const bench = { v1: loadBench(path.join(inputs, 'recordings/bench_v1.csv.gz')), v2: loadBench(path.join(inputs, 'recordings/bench_v2.csv.gz')) };
  const synth = sessionV1(60, 7), runs = {};
  const put = (id, r) => { runs[id] = r; log('flight', id, r.steps, r.final.slice(0, 16)); };
  for (const v of ['v1', 'v2']) for (const c of ['rate-inv', 'stick-inv', 'v12']) put(`keys-${v}/${c}`, freeRun(P, cfgs[c], bench[v], v === 'v1' ? 11 : 13));
  for (const c of Object.keys(cfgs)) put(`synthetic/${c}`, runFrames(P, cfgs[c], synth, { ground: () => 0 }));
  put('compat/stick-inv', runFrames(P, cfgs['stick-inv'], sessionV1(30, 5), { ground: () => 0, compat: true }));
  put('compat/rate-alt', runFrames(P, cfgs['rate-alt'], sessionV1(30, 3), { ground: () => 0, compat: true }));
  for (const c of ['rate-inv', 'rate-alt', 'stick-inv']) for (const axis of ['x', 'y']) for (const [px, T0] of [[150, .15], [400, .3], [400, .8]]) put(`swipe-${axis}-${px}px-${T0}s/${c}`, swipe(P, cfgs[c], axis, px, T0));
  for (const v of ['v1', 'v2']) for (const c of ['rate-inv', 'v12']) put(`dense-${v}/${c}`, dense(P, T, cfgs[c], bench[v]));
  for (const c of ['rate-inv', 'v12']) put(`takeoff/${c}`, takeOff(P, cfgs[c]));
  // Touchdowns: every case with the default lever law, the slide and the vertical threshold also with the v12 one. The
  // recording refuses a set that does not straddle each crash threshold (the outcome is kept with the run).
  for (const [k, td] of Object.entries(TOUCHDOWNS)) for (const c of ['rate-alt', ...(['slide-z-10', 'hard-4.3'].includes(k) ? ['v12'] : [])]) {
    const run = touchdown(P, T, cfgs[c], td), o = run.outcome, wantCrash = /^(fast|hard-4\.8|tilt-35)/.test(k);
    if (!golden && (!o.touched || o.crashed !== wantCrash || !wantCrash && !(o.liftedOff && (!k.startsWith('slide') || o.slide > 1)))) throw Error(`touchdown ${k}/${c}: unexpected outcome ${JSON.stringify(o)}`);
    put(`touchdown-${k}/${c}`, run);
  }
  return { suite: 'flight', meta: { configs: cfgs, stepHz: 120, checkpointEverySteps: 60, parityScript: { generator: 'session-v1', seconds: 60, seed: 7, frames: synth.length, framesSha256: hashFrames(synth), config: 'rate-alt', run: 'synthetic/rate-alt' },
    touchdowns: TOUCHDOWNS, inputs: { bench_v1: 'recordings/bench_v1.csv.gz', bench_v2: 'recordings/bench_v2.csv.gz', keySeeds: { v1: 11, v2: 13 } }, threeDraws: realm.counters.threeDraws, gameDraws: realm.counters.gameDraws }, runs };
}
module.exports = { record, sessionV1, runFrames, hashFrames, loadBench };
