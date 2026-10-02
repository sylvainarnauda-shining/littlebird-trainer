'use strict';
// The key bindings of HeliSettings: the actions and their default keys (data of settings-data.js), the accepted key codes
// and HeliSettings.validBindings, which brings a stored or imported bindings block to one valid key (or "Unbound") per
// action: a duplicate is refused, an action a newer version added takes its default only if that key is free.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');

const S = load('settings.js');
const D = load('settings-data.js');
const ids = D.ACTIONS.map((a) => a.id);

test('fifteen actions, in the order of the profile, each with a label and a default key the pattern accepts', () => {
  assert.deepEqual(ids, [
    'collectiveUp',
    'collectiveDown',
    'pitchUp',
    'pitchDown',
    'yawLeft',
    'yawRight',
    'rollLeft',
    'rollRight',
    'fire',
    'flares',
    'freeLook',
    'shop',
    'view',
    'reset',
    'neutral',
  ]);
  assert.deepEqual(Object.keys(S.baseBindings), ids);
  assert.deepEqual(Object.keys(S.labels), ids);
  for (const a of D.ACTIONS) {
    assert.ok(a.label.length > 3, a.id);
    assert.match(a.key, S.KEY_PATTERN, a.id);
    assert.equal(S.baseBindings[a.id], a.key);
    assert.equal(S.labels[a.id], a.label);
  }
  assert.equal(new Set(D.ACTIONS.map((a) => a.key)).size, ids.length, 'no two actions share a default key');
});

test("the default keys are the game's helicopter layout and the trainer's own keys", () => {
  const b = S.baseBindings;
  assert.deepEqual(
    [b.collectiveUp, b.collectiveDown, b.pitchUp, b.pitchDown],
    ['ShiftLeft', 'ControlLeft', 'KeyS', 'KeyW'],
  );
  assert.deepEqual([b.yawLeft, b.yawRight, b.rollLeft, b.rollRight], ['KeyQ', 'KeyE', 'KeyA', 'KeyD']);
  assert.deepEqual([b.fire, b.flares, b.freeLook, b.view], ['Mouse0', 'KeyV', 'AltLeft', 'KeyC']);
  assert.deepEqual([b.shop, b.reset, b.neutral], ['KeyB', 'KeyR', 'KeyX']);
});

test('the key names are the French AZERTY prints of the physical positions; every default key is named or a letter', () => {
  const names = D.KEY_NAMES;
  assert.deepEqual([names.KeyW, names.KeyA, names.KeyQ, names.KeyZ], ['Z', 'Q', 'A', 'W']);
  assert.deepEqual(
    [names.ShiftLeft, names.ControlLeft, names.Mouse0, names.Mouse2],
    ['Maj gauche', 'Ctrl gauche', 'Clic gauche', 'Clic droit'],
  );
  for (const a of D.ACTIONS) assert.ok(a.key in names || /^Key[A-Z]$/.test(a.key), a.id);
  for (const code of Object.keys(names)) assert.match(code, S.KEY_PATTERN, code);
});

test('KEY_PATTERN: letters, digits, arrows, modifiers, Space and three mouse buttons; nothing else', () => {
  for (const code of [
    'KeyA',
    'KeyZ',
    'Digit0',
    'Digit9',
    'Space',
    'ShiftLeft',
    'ShiftRight',
    'ControlLeft',
    'ControlRight',
    'AltLeft',
    'AltRight',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Mouse0',
    'Mouse1',
    'Mouse2',
  ])
    assert.match(code, S.KEY_PATTERN, code);
  for (const code of [
    '',
    'keya',
    'Key',
    'KeyAB',
    'Mouse3',
    'Escape',
    'Tab',
    'F5',
    'Numpad0',
    'Enter',
    'Unbound',
    ' KeyA',
    'KeyA\n',
    'Digit10',
  ])
    assert.doesNotMatch(code, S.KEY_PATTERN, JSON.stringify(code));
});

test('anything that is not an object gives the default bindings, as a copy', () => {
  for (const data of [undefined, null, 0, 'text', true]) {
    const out = S.validBindings(data);
    assert.deepEqual(out, S.baseBindings);
    assert.notEqual(out, S.baseBindings);
  }
});

test('saved keys are kept; "Unbound" is kept and frees nothing for another action', () => {
  const out = S.validBindings({ fire: 'KeyF', flares: 'Unbound', view: 'Mouse1' });
  assert.equal(out.fire, 'KeyF');
  assert.equal(out.flares, 'Unbound');
  assert.equal(out.view, 'Mouse1');
  assert.equal(out.shop, 'KeyB');
  assert.deepEqual(Object.keys(out), ids);
  const twice = S.validBindings({ fire: 'Unbound', flares: 'Unbound' });
  assert.deepEqual([twice.fire, twice.flares], ['Unbound', 'Unbound'], 'several actions may be unbound');
});

test('a key used by two saved actions is refused (an import is not silently repaired)', () => {
  assert.throws(() => S.validBindings({ fire: 'KeyF', flares: 'KeyF' }), /même touche/);
  assert.throws(() => S.validBindings({ fire: 'Mouse2', view: 'Mouse2' }), /même touche/);
  assert.throws(
    () => S.validBindings({ collectiveUp: 'KeyA', rollLeft: 'KeyA' }),
    /même touche/,
    'one of them also a default of another',
  );
});

test('an invalid code is ignored: the action takes its default key if free, "Unbound" if another action holds it', () => {
  const free = S.validBindings({ shop: 'F5' });
  assert.equal(free.shop, 'KeyB');
  const taken = S.validBindings({ shop: 'Escape', view: 'KeyB' });
  assert.equal(taken.view, 'KeyB');
  assert.equal(taken.shop, 'Unbound', 'its default KeyB is held by the saved view key');
  for (const bad of [7, null, {}, ['KeyF'], 'keyf', 'Mouse3'])
    assert.equal(S.validBindings({ fire: bad }).fire, S.baseBindings.fire, JSON.stringify(bad));
});

test('an action a newer version added takes its default key only if no saved action uses it', () => {
  const old = Object.fromEntries(Object.entries(S.baseBindings).filter(([action]) => action !== 'neutral'));
  assert.equal(S.validBindings(old).neutral, 'KeyX');
  assert.equal(S.validBindings({ ...old, view: 'KeyX' }).neutral, 'Unbound');
});

test('a block of the default keys passes unchanged', () => {
  assert.deepEqual(S.validBindings({ ...S.baseBindings }), S.baseBindings);
});
