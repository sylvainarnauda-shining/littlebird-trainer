'use strict';
// The pointer-lock request and its fallback (the slice of app.js from enableCompatibility() to start(), run in a vm
// context with a fake page): capture missing, refused, the old API returning nothing, capture granted, and a pause
// arriving while the request is pending. After any fallback the shared mouse input state is neutral. Nothing here can
// reach a real pointer lock: the "world" element is a plain object.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { load } = require('../helpers/runtime');
const { slice } = require('../helpers/app-source');

const P = load('physics.js');
const code = slice('  function enableCompatibility(){', '  function start(){');

async function scenario(kind) {
  const els = { world: { focus() {} }, mouseMode: { hidden: true } };
  const timeouts = [];
  const messages = [];
  const mouse = {
    ...P.createInputState(),
    mousePitch: 1,
    mouseYaw: 1,
    accX: 40,
    accY: -25,
    ratePitch: 12,
    rateYaw: -3,
  };
  const context = {
    running: true,
    compatInput: false,
    skipMouse: false,
    mouse,
    P,
    lockAttempt: 0,
    $: (id) => els[id],
    document: { pointerLockElement: null },
    setTimeout: (fn) => timeouts.push(fn),
    toast: (msg) => messages.push(msg),
  };
  if (kind === 'refused') els.world.requestPointerLock = () => Promise.reject(new Error('Permission denied'));
  if (kind === 'legacy' || kind === 'late-pause') els.world.requestPointerLock = () => undefined;
  if (kind === 'success') {
    els.world.requestPointerLock = () => {
      context.document.pointerLockElement = els.world;
      return Promise.resolve();
    };
  }
  vm.createContext(context);
  vm.runInContext(code, context);
  await vm.runInContext('lock()', context);
  if (kind === 'late-pause') context.running = false;
  timeouts.forEach((fn) => fn());
  return { context, els, mouse, messages };
}

for (const kind of ['missing', 'refused', 'legacy']) {
  test(`capture ${kind}: the page falls back to the compatibility mode with a neutral input state and a notice`, async () => {
    const { context, els, mouse, messages } = await scenario(kind);
    assert.equal(context.running, true);
    assert.equal(context.compatInput, true);
    assert.equal(els.mouseMode.hidden, false);
    assert.equal(mouse.mousePitch, 0);
    assert.equal(mouse.mouseYaw, 0);
    assert.equal(mouse.accX, 0);
    assert.equal(mouse.ratePitch, 0, 'input state neutral after the fallback');
    assert.ok(messages.length, 'a notice is shown');
  });
}

for (const kind of ['success', 'late-pause']) {
  test(`capture ${kind}: no fallback`, async () => {
    const { context } = await scenario(kind);
    assert.equal(context.compatInput, false);
  });
}

test('the flight asks for a plain pointer lock (no unadjustedMovement: the measured mouse gain is per accelerated px)', () => {
  assert.ok(/requestPointerLock\(\)/.test(code), 'requestPointerLock() with no argument');
  assert.ok(!/unadjustedMovement\s*:/.test(code), 'no raw counts in the flight');
});
