'use strict';
// A scripted flight over the reference valley through the mocked-DOM application's own keyboard and mouse handlers, at
// a fixed 100 Hz frame rate (deterministic; the previous test suite flew the same script in a real browser in real time):
// take-off from the helipad well above the trees, a dive down the valley, a banked turn in the chase view, levelling
// with short opposite clicks, and a zoom climb. The flight stays stable over the relief. It flies the mouse-pilot key
// layout (roll on the mouse buttons), stored in the profile.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootApp } = require('../helpers/mock-dom');
const { seedMathRandom, SEED } = require('../helpers/rng');

seedMathRandom(SEED + 109);
const { P } = require('../helpers/runtime').modules();
const S = bootApp({ profile: require('../helpers/profiles').mousePilot(), manualClock: true });
const { app, diag, el, keyDown, keyUp, callbacks } = S;
let clock = 1000;
const wait = (seconds) => {
  for (let i = 0; i < Math.round(seconds * 100); i++) {
    clock += 10;
    app.frame(clock);
  }
};
const press = (code, seconds) => {
  keyDown(code);
  wait(seconds);
  keyUp(code);
};
const click = (button, seconds) => {
  const ev = { button, target: el('world'), preventDefault() {}, stopPropagation() {} };
  callbacks.mousedown(ev);
  wait(seconds);
  callbacks.mouseup(ev);
};
const kmh = (s) => Math.hypot(...s.velocity) * 3.6;
const agl = (s) => s.position[1] - P.terrain(s.position[0], s.position[2]);

test('free flight from the mode card with the pointer captured (emulated in the page)', () => {
  S.modeCards.find((c) => c.dataset.mode === 'free').onclick();
  app.setConfig({ duration: 0 });
  S.document.pointerLockElement = el('world');
  app.start();
  wait(0.1);
  assert.ok(diag().running);
});

test('take-off well above the trees', () => {
  press('KeyW', 3.5);
  wait(5);
  const s = diag();
  assert.ok(!s.onGround && agl(s) > 20, 'hover above the trees: ' + agl(s).toFixed(1) + ' m');
});

let before = null;
test('a dive down the valley: nose down with the complementary key, then 18 s: faster than 150 km/h, still flying', () => {
  press('ArrowUp', 0.3);
  wait(18);
  const s = diag();
  assert.ok(kmh(s) > 150, 'accelerates: ' + kmh(s).toFixed(0) + ' km/h');
  assert.ok(s.running && !s.onGround, 'still flying over the relief');
});

test('chase view, then a banked turn held after a 0.45 s left click', () => {
  keyDown('KeyE');
  keyUp('KeyE');
  wait(0.7);
  assert.equal(diag().view, 'chase');
  click(0, 0.45);
  wait(1.8);
  assert.ok(diag().attitude.bank < -15, 'left bank held: ' + diag().attitude.bank.toFixed(1));
});

test('levelled with short opposite clicks', () => {
  let s;
  for (let i = 0; i < 30; i++) {
    s = diag();
    if (Math.abs(s.attitude.bank) < 5 && Math.abs(s.attitude.pitch) < 25) break;
    const button = s.attitude.bank < 0 ? 2 : 0;
    click(button, s.attitude.bank < -15 || s.attitude.bank > 15 ? 0.15 : 0.06);
    wait(0.45);
  }
  s = diag();
  assert.ok(Math.abs(s.attitude.bank) < 12, 'levelled before the zoom: ' + s.attitude.bank.toFixed(1));
  before = s;
});

test('a zoom climb with S gains height and bleeds speed', () => {
  assert.ok(before, 'previous step ran');
  press('KeyS', 0.7);
  wait(3.5);
  const s = diag();
  assert.ok(
    s.position[1] - before.position[1] > 15,
    'zoom climb gains height: ' + (s.position[1] - before.position[1]).toFixed(1),
  );
  assert.ok(kmh(s) < kmh(before), 'zoom bleeds speed');
  assert.ok(s.running && !s.onGround);
});
