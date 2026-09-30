'use strict';
// Behaviour of the identified flight model (physics.js) against the values measured on the two reference recordings
// (checks F01-F10, bands unchanged from the previous test suite). Model outputs are compared with measurements; passing does
// not prove the game uses the same equations. Deterministic (no random draw).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');

const T = load('vendor/three.min.js');
const P = load('physics.js');
const DT = 1 / 120;
const neutral = { pitch: 0, yaw: 0, roll: 0, collective: 0 };
const make = (over = {}, h = 500) => {
  const f = new P.Flight({ ...P.defaults, ...over });
  f.reset(h);
  return f;
};
const run = (f, input, s, each) => {
  for (let i = 0; i < Math.round(s / DT); i++) {
    f.step(DT, { ...neutral, ...input });
    each?.(f, i * DT);
  }
};
const att = (f) => f.attitude();
const kmh = (f) => f.velocity.length() * 3.6;

test('F01 hover: lever 0 is hover thrust; 60 s without input keeps altitude within 0.2 m', () => {
  const f = make();
  run(f, {}, 60);
  assert.ok(Math.abs(f.position.y - 500) < 0.2, 'hover holds altitude');
});

test('F02 roll rate after 0.5 s and 1 s of click (fit P 80, tau 0.267/0.44): 24-40 and 47-63 deg/s', () => {
  const f = make();
  const rateAt = [];
  let prev = 0;
  run(f, { roll: -1 }, 1, (g, t) => {
    const b = att(g).bank;
    if (Math.abs(t - 0.49) < DT / 2 || Math.abs(t - 0.99) < DT / 2) rateAt.push((b - prev) / DT);
    prev = b;
  });
  assert.ok(rateAt[0] > 24 && rateAt[0] < 40, 'roll rate after 0.5 s: ' + rateAt[0]);
  assert.ok(rateAt[1] > 47 && rateAt[1] < 63, 'roll rate after 1 s: ' + rateAt[1]);
});

test('F03 a 0.1 s click banks 6.5-9.5 deg; no auto-levelling (drift < 2 deg over 3 s)', () => {
  const f2 = make();
  run(f2, { roll: -1 }, 0.1);
  run(f2, {}, 5);
  const tap = att(f2).bank;
  assert.ok(tap > 6.5 && tap < 9.5, '0.1 s click gives ~8 deg of bank: ' + tap);
  const hold = make();
  run(hold, { roll: -1 }, 0.5);
  run(hold, {}, 1.5);
  const b1 = att(hold).bank;
  run(hold, {}, 3);
  assert.ok(Math.abs(att(hold).bank - b1) < 2, 'no auto-levelling');
});

test('F04 yaw key plateau 36 +- 1.5 deg/s', () => {
  const f = make();
  const h0 = att(f).heading;
  const rates = [];
  let prev = h0;
  run(f, { yaw: -1 }, 4.4, (g) => {
    const h = att(g).heading;
    let d = h - prev;
    if (d < -180) d += 360;
    if (d > 180) d -= 360;
    rates.push(d / DT);
    prev = h;
  });
  const plateau = rates.slice(-120).reduce((a, b) => a + b) / 120;
  assert.ok(Math.abs(plateau - 36) < 1.5, 'yaw plateau 36 deg/s: ' + plateau);
});

test('F05 pitch key: 0.5 s of S then settle gives 22-30 deg nose-up', () => {
  const f = make();
  run(f, { pitch: 1 }, 0.5);
  run(f, {}, 3);
  assert.ok(att(f).pitch > 22 && att(f).pitch < 30, 'pitch: ' + att(f).pitch);
});

test('F06 collective: Z 0.7 s climbs 4.5-9 m/s and stops; Shift 2 s descends -3..-9 m/s and holds', () => {
  {
    const f = make();
    let peak = 0;
    run(f, { collective: 1 }, 0.7, (g) => (peak = Math.max(peak, g.velocity.y)));
    const lever = f.collective;
    run(f, {}, 10, (g) => (peak = Math.max(peak, g.velocity.y)));
    assert.ok(lever > 0.95, 'Z raises the lever at ~3/s');
    assert.ok(peak > 4.5 && peak < 9, 'peak climb rate: ' + peak);
    assert.ok(Math.abs(f.velocity.y) < 0.5, 'climb stops after release');
    assert.ok(f.position.y - 500 > 5 && f.position.y - 500 < 35, 'altitude gain after a short Z press');
  }
  {
    const f = make();
    let low = 0;
    run(f, { collective: -1 }, 2, (g) => (low = Math.min(low, g.velocity.y)));
    const lever = f.collective;
    run(f, {}, 10, (g) => (low = Math.min(low, g.velocity.y)));
    assert.ok(lever < -0.95);
    assert.ok(low < -3 && low > -9, 'minimum vertical speed: ' + low);
    assert.ok(Math.abs(f.velocity.y) < 0.5);
  }
});

test('F07 take-off: stays down at idle lever, hovers above 8 m after Z 1.2 s', () => {
  const f = make({}, 0);
  f.position.y = P.terrain(0, 130) + 1.25;
  f.collective = -1;
  f.onGround = true;
  run(f, {}, 2);
  assert.ok(f.onGround && f.position.y < 2, 'stays down at idle');
  run(f, { collective: 1 }, 1.2);
  run(f, {}, 12);
  assert.ok(!f.crashed && !f.onGround && f.position.y > 8 && Math.abs(f.velocity.y) < 0.6, 'take-off then hover');
});

test('F08 top speed at 13 deg nose-down 255-300 km/h (289 seen); the lever saturates and it sinks', () => {
  const cruise = make();
  cruise.quaternion.setFromEuler(new T.Euler((-10 * Math.PI) / 180, 0, 0, 'YXZ'));
  let t100 = null;
  run(cruise, {}, 60, (g, t) => {
    if (t100 === null && kmh(g) > 100) t100 = t;
  });
  assert.ok(t100 !== null, 'reaches 100 km/h at 10 deg nose-down');
  const top = make();
  top.quaternion.setFromEuler(new T.Euler((-13 * Math.PI) / 180, 0, 0, 'YXZ'));
  run(top, {}, 90);
  assert.ok(kmh(top) > 255 && kmh(top) < 300, 'top speed near the 289 km/h of the recordings: ' + kmh(top));
  assert.ok(top.collective > 0.99 && top.velocity.y < 0, 'at 13 deg nose-down the lever saturates and it sinks');
});

test('F09 zoom climb from ~280 km/h: > 50 m, > 150 km/h bled, lever < -0.95', () => {
  const f = make();
  f.quaternion.setFromEuler(new T.Euler((-12 * Math.PI) / 180, 0, 0, 'YXZ'));
  run(f, {}, 80);
  const v0 = kmh(f);
  const h0 = f.position.y;
  let top = 0;
  let minLever = 1;
  let slowest = v0;
  run(f, { pitch: 1 }, 0.7);
  run(f, {}, 9, (g) => {
    top = Math.max(top, g.position.y - h0);
    minLever = Math.min(minLever, g.collective);
    slowest = Math.min(slowest, kmh(g));
  });
  assert.ok(top > 50, 'zoom climb height: ' + top);
  assert.ok(v0 - slowest > 150, 'zoom climb bleeds speed');
  assert.ok(minLever < -0.95, 'the hold lowers the lever to fight the climb');
});

function turnRatio(speedKmh) {
  const f = make();
  const v = speedKmh / 3.6;
  f.velocity.set(0, 0, -v);
  f.quaternion.setFromEuler(new T.Euler(-Math.atan((0.0003 * v * v) / 9.81), 0, 0, 'YXZ'));
  run(f, { roll: -1 }, 0.4);
  run(f, {}, 0.6);
  const a = att(f).heading;
  let coordinated = 0;
  let n = 0;
  run(f, {}, 3, (g) => {
    coordinated += (((9.81 * Math.tan((att(g).bank * Math.PI) / 180)) / g.velocity.length()) * 180) / Math.PI;
    n++;
  });
  let d = att(f).heading - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return { ratio: d / 3 / (coordinated / n), bank: att(f).bank };
}

test('F10 weathervane: heading follows the path at speed (0.5-1.1 at 250 km/h), not at 60 km/h (|r| < 0.25)', () => {
  const fast = turnRatio(250);
  const slow = turnRatio(60);
  assert.ok(fast.ratio > 0.5 && fast.ratio < 1.1, 'nose follows the path at 250 km/h: ' + fast.ratio);
  assert.ok(Math.abs(slow.ratio) < 0.25, 'little heading change from bank at 60 km/h: ' + slow.ratio);
});

test('F10 yaw key at 220 km/h keeps its authority (peak > 12 deg/s)', () => {
  const f = make();
  f.velocity.set(0, 0, -220 / 3.6);
  run(f, {}, 0.2);
  const h0 = att(f).heading;
  let peak = 0;
  let prev = h0;
  const track = (g) => {
    const h = att(g).heading;
    peak = Math.max(peak, (h - prev) / DT);
    prev = h;
  };
  run(f, { yaw: -1 }, 0.5, track);
  run(f, {}, 0.5, track);
  assert.ok(peak > 12, 'yaw authority kept at speed: ' + peak);
});

test('F10 bank without pitch input at 100 km/h holds altitude within 8 m', () => {
  const f = make();
  f.velocity.set(0, 0, -100 / 3.6);
  run(f, { roll: -1 }, 0.6);
  run(f, {}, 6);
  assert.ok(Math.abs(f.position.y - 500) < 8, 'altitude change: ' + (f.position.y - 500));
});
