'use strict';
// Check F13: replays the recorded attitude and collective keys of both reference recordings through physics.js and
// compares the simulated collective lever, vertical speed and airspeed with the HUD readings. Attitude is forced from
// the recordings (mouse input cannot be observed), so this validates the collective hold and the translational model.
// Fixtures: recordings/replay_v{1,2}.json (legacy 30 Hz series, sha256 checked).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');
const { loadLegacy } = require('../helpers/fixtures');

const T = load('vendor/three.min.js');
const P = load('physics.js');
const DEG = Math.PI / 180;
const WINDOW = 6;
const DT = 1 / 30;

function quat(heading, pitch, bank) {
  return new T.Quaternion().setFromEuler(new T.Euler(pitch * DEG, -heading * DEG, -bank * DEG, 'YXZ'));
}

function replay(d, cfg) {
  const n = d.t.length;
  const per = Math.round(WINDOW / DT);
  let arcErr = 0;
  let vsErr = 0;
  let spdErr = 0;
  let na = 0;
  let nv = 0;
  let ns = 0;
  let windows = 0;
  for (let i0 = 0; i0 + per < n; i0 += per) {
    let ok = true;
    for (let i = i0; i < i0 + per; i++) {
      if (
        [d.bank[i], d.pitch[i], d.heading[i], d.arc[i]].some((x) => x === null) ||
        (d.agl[i] !== null && d.agl[i] < 8) ||
        Math.abs(d.bank[i]) > 70 ||
        (d.maj[i] && d.agl[i] !== null && d.agl[i] < 15)
      ) {
        ok = false;
        break;
      }
    }
    if (!ok || d.spd[i0] === null || d.vs[i0] === null) continue;
    if (Math.abs(d.heading[i0 + per - 1] - d.heading[i0]) > 400) continue;
    windows++;
    const f = new P.Flight(cfg);
    f.reset(5000);
    const h = d.heading[i0] * DEG;
    const gamma = Math.asin(Math.max(-1, Math.min(1, d.vs[i0] / Math.max(d.spd[i0], 0.5))));
    const vh = d.spd[i0] * Math.cos(gamma);
    f.velocity.set(vh * Math.sin(h), d.spd[i0] * Math.sin(gamma), -vh * Math.cos(h));
    f.collective = d.arc[i0];
    f.verticalAccel = 0;
    for (let i = i0; i < i0 + per; i++) {
      if (d.raw.arc[i] !== null) {
        const e = f.collective - d.raw.arc[i];
        arcErr += e * e;
        na++;
      }
      if (d.raw.vs[i] !== null) {
        const e = f.velocity.y - d.raw.vs[i];
        vsErr += e * e;
        nv++;
      }
      if (d.raw.spd[i] !== null) {
        const e = f.velocity.length() - d.raw.spd[i];
        spdErr += e * e;
        ns++;
      }
      f.quaternion.copy(quat(d.heading[i], d.pitch[i], d.bank[i]));
      f.angular.set(0, 0, 0);
      f.cyclic.set(0, 0, 0);
      const collective = d.maj[i] ? -1 : d.z[i] ? 1 : 0;
      f.step(DT, { pitch: 0, yaw: 0, roll: 0, collective });
      f.position.y = 5000;
      f.onGround = false;
    }
  }
  return {
    windows,
    arc: +Math.sqrt(arcErr / na).toFixed(3),
    vs: +Math.sqrt(vsErr / nv).toFixed(2),
    speed: +Math.sqrt(spdErr / ns).toFixed(2),
  };
}

test('F13 attitude-forced replay of both recordings: VS rms < 3 m/s, lever rms < 0.45, hold and body flow help, drag beats v3', () => {
  const results = {};
  for (const video of ['v1', 'v2']) {
    const d = loadLegacy(video);
    const base = { ...P.defaults, weathervane: 0 };
    results[video] = {
      v6: replay(d, base),
      withoutHold: replay(d, { ...base, altitudeHold: false }),
      withoutBodyFlow: replay(d, { ...base, bodyFlowDrag: 0 }),
      v3LinearDrag: replay(d, { ...base, drag: 0.045, quadraticDrag: 0.0015 }),
    };
  }
  const weighted = (model) => ['v1', 'v2'].reduce((s, v) => s + results[v][model].speed * results[v][model].windows, 0);
  for (const v of ['v1', 'v2']) {
    const r = results[v];
    assert.ok(r.v6.windows >= 8, `${v}: enough replay windows`);
    assert.ok(r.v6.vs < 3.0, `${v}: vertical speed replay error ${r.v6.vs}`);
    assert.ok(r.v6.arc < 0.45, `${v}: collective lever replay error ${r.v6.arc}`);
    assert.ok(r.v6.arc < r.withoutHold.arc, 'the automatic hold explains the collective indicator');
    assert.ok(r.v6.vs <= r.withoutBodyFlow.vs, 'the body-axis airflow term improves vertical speed');
  }
  // Recording 2's airspeed errors are dominated by two windows that start with an unknown sideslip (after a 125 deg
  // pedal turn): compared over both recordings.
  assert.ok(weighted('v6') < 0.5 * weighted('v3LinearDrag'), 'the identified drag beats the v3 drag on airspeed');
});
