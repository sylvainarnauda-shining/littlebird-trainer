'use strict';
// The app's own mousemove handler (the slice of app.js between the mousemove and pointerlockchange listeners, run in a
// vm context): the v12 virtual stick without capture, the measured rate law with capture (movement summed per frame,
// K x px / frame time), the v12 stick chosen with capture, free look; and the hidden cursor while flying. No browser
// pointer permission is involved.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { load, SRC } = require('../helpers/runtime');
const { slice } = require('../helpers/app-source');

const P = load('physics.js');
const handler = slice("  document.addEventListener('mousemove'", "  document.addEventListener('pointerlockchange'");

function setup() {
  const callbacks = {};
  const world = {};
  const mouse = P.createInputState();
  const c = {
    document: { addEventListener: (name, fn) => (callbacks[name] = fn), pointerLockElement: null },
    $: () => world,
    running: true,
    compatInput: true,
    skipMouse: true,
    virtualAnchor: null,
    lastPointer: null,
    mouse,
    freeLookHeld: false,
    lookYaw: 0,
    lookPitch: 0,
    cfg: { ...P.defaults },
    P,
  };
  vm.createContext(c);
  vm.runInContext(handler, c, { filename: path.join(SRC, 'app.js') });
  const move = (x, y, mx = 0, my = 0) =>
    callbacks.mousemove({ target: world, clientX: x, clientY: y, movementX: mx, movementY: my });
  return { c, world, mouse, move };
}
// A captured session after its first mousemove (the handler skips the first event after a lock: skipMouse).
function captured() {
  const s = setup();
  s.c.compatInput = false;
  s.c.skipMouse = false;
  s.c.document.pointerLockElement = s.world;
  return s;
}

// The stick's pitch sign follows the Y-axis setting: a pointer moved down by dy deflects the pitch by dy x (+1 inverted,
// -1 not inverted); both settings are checked explicitly.
for (const invertY of [false, true]) {
  test(`without capture (compatibility mode) the mouse drives the v12 virtual stick, whatever the law (Y ${invertY ? 'inverted' : 'normal'})`, () => {
    const { c, mouse, move } = setup();
    assert.equal(c.cfg.mouseLaw, 'rate', 'default: the measured rate law');
    c.cfg.invertY = invertY;
    move(400, 300);
    move(500, 330);
    assert.ok(mouse.mouseYaw < 0, 'virtual stick yaw: pointer right, yaw right');
    assert.equal(Math.sign(mouse.mousePitch), invertY ? 1 : -1, 'virtual stick pitch follows the Y-axis setting');
    const held = mouse.mouseYaw;
    move(500, 330);
    assert.equal(mouse.mouseYaw, held, 'holding the offset keeps the turn');
    move(400, 300);
    assert.equal(mouse.mouseYaw, 0);
    assert.equal(Math.abs(mouse.mousePitch), 0, 'back to the origin returns to neutral');
    assert.equal(mouse.accX, 0, 'no rate-law movement summed without capture');
  });
}

test('the first mousemove after a lock is skipped (no jump from the pointer warp)', () => {
  const { c, world, mouse, move } = setup();
  c.compatInput = false;
  c.document.pointerLockElement = world;
  move(400, 300, 5, -5);
  assert.equal(mouse.accX, 0);
  assert.equal(c.skipMouse, false);
  move(400, 300, 3, -2);
  assert.equal(mouse.accX, 3);
});

test('captured pointer, rate law: movementX/Y summed for the frame, then a rate of K x px / frame time', () => {
  const { c, mouse, move } = captured();
  move(400, 300, 5, -5);
  move(400, 300, 3, -2);
  assert.equal(mouse.accX, 8);
  assert.equal(mouse.accY, -7);
  assert.equal(mouse.mouseYaw, 0);
  assert.equal(mouse.mousePitch, 0, 'the stick does not move');
  // K = mouseRateScale x sens/100 x multiplier with the profile defaults.
  P.frameStart(mouse, c.cfg, 0.01);
  const cfg = c.cfg;
  const kPitch = (cfg.mouseRateScale * cfg.pitchSens * cfg.vehicleMultiplier) / 100;
  const kYaw = (cfg.mouseYawScale * cfg.yawSens * cfg.vehicleMultiplier) / 100;
  const sign = cfg.invertY ? 1 : -1;
  assert.ok(Math.abs(mouse.ratePitch - (sign * -7 * kPitch) / 0.01) < 1e-9, 'pitch rate: ' + mouse.ratePitch);
  assert.ok(Math.abs(mouse.rateYaw - (-8 * kYaw) / 0.01) < 1e-9, 'yaw rate: ' + mouse.rateYaw);
  assert.equal(mouse.accX, 0, 'movement consumed by the frame');
});

test('captured pointer, v12 stick chosen: relative input moves the stick; free look turns the view and leaves the controls', () => {
  const { c, mouse, move } = captured();
  c.cfg.mouseLaw = 'stick';
  P.resetInput(mouse);
  move(400, 300, 5, -5);
  assert.ok(mouse.mouseYaw < 0, 'captured mouse still uses relative input');
  assert.equal(Math.sign(mouse.mousePitch), c.cfg.invertY ? -1 : 1, 'pointer up: pitch per the Y-axis setting');
  const yawBefore = mouse.mouseYaw;
  const pitchBefore = mouse.mousePitch;
  c.freeLookHeld = true;
  move(400, 300, 40, -20);
  assert.equal(mouse.mouseYaw, yawBefore);
  assert.equal(mouse.mousePitch, pitchBefore);
  assert.ok(c.lookYaw < 0 && c.lookPitch > 0, 'free look turns the view');
  c.cfg.mouseLaw = 'rate';
  move(400, 300, 40, -20);
  assert.equal(mouse.accX, 0, 'free look: nothing summed for the rate law');
});

test('the cursor is hidden over the view while flying', () => {
  assert.ok(fs.readFileSync(path.join(SRC, 'style.css'), 'utf8').includes('body.flying #world{cursor:none}'));
});
