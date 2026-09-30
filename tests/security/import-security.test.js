'use strict';
// Untrusted inputs of the application (one trust gate), in the mocked-DOM application: an imported profile,
// the game's settings file, and the stored profile, including the declared fixes of the publication prep (CHANGELOG.md):
// R5.1 Object.hasOwn for the light preset id; R5.2 every imported number clamped (aaFuse and aaMinRange too); R5.3 the
// export reduced to its format, version, revision, settings and bindings; R5.6 the retired options forced to their
// defaults; R5.8 the game's file read inside its helicopter section only. Math.random seeded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootApp, fileEvent, PROFILE_KEY } = require('../helpers/mock-dom');
const { seedMathRandom, SEED } = require('../helpers/rng');

seedMathRandom(SEED + 201);
const { P, M, G } = require('../helpers/runtime').modules();
const S = bootApp({ profile: null });
const { app, el, hooks } = S;
const toast = () => el('toast').textContent;
const REFUSED = /^Import refusé/;
const importProfile = (text) => el('import').onchange(fileEvent(text));
const importIni = (text) => el('importGame').onchange(fileEvent(text));
const profile = (settings, bindings = {}) =>
  JSON.stringify({ version: 1, tuningRevision: 16, settings: { ...P.defaults, ...M.defaults, ...settings }, bindings });
const PROTO_KEYS = Object.getOwnPropertyNames(Object.prototype).sort();

test('a profile above 100 kB, invalid JSON, another format version or missing parts are refused with a notice', async () => {
  const before = JSON.stringify(app.cfg);
  await importProfile(profile({ pitchSens: 31 }).padEnd(100001, ' '));
  assert.match(toast(), REFUSED, 'over 100 kB');
  await importProfile('{"version":1,');
  assert.match(toast(), REFUSED, 'invalid JSON');
  await importProfile(JSON.stringify({ version: 2, settings: {}, bindings: {} }));
  assert.match(toast(), REFUSED, 'unknown format version');
  await importProfile(JSON.stringify({ version: 1, settings: {} }));
  assert.match(toast(), REFUSED, 'no bindings');
  assert.equal(JSON.stringify(app.cfg), before, 'nothing applied');
});

test('__proto__, constructor and prototype keys never reach Object.prototype nor the settings', async () => {
  const hostile =
    '{"version":1,"tuningRevision":16,"settings":{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":2}},"prototype":{"polluted":3},"pitchSens":31},"bindings":{"__proto__":{"fire":"KeyZ"}}}';
  await importProfile(hostile);
  assert.equal({}.polluted, undefined, 'Object.prototype untouched');
  assert.deepEqual(Object.getOwnPropertyNames(Object.prototype).sort(), PROTO_KEYS);
  assert.ok(
    !Object.hasOwn(app.cfg, 'constructor') &&
      !Object.hasOwn(app.cfg, 'prototype') &&
      !Object.hasOwn(app.cfg, '__proto__'),
    'no such key in the settings',
  );
  assert.equal(app.cfg.pitchSens, 31, 'the valid value applied');
});

test('wrong types fall back to the defaults; numbers are clamped to the control ranges; enums are whitelisted; unknown keys dropped', async () => {
  await importProfile(
    profile({
      pitchSens: 'fast',
      yawSens: [5],
      vehicleMultiplier: { a: 1 },
      volume: null,
      invertY: 'yes',
      scenario: 'hack',
      difficulty: 'god',
      graphics: 'ultra',
      mouseLaw: 'joystick',
      madeUp: 1,
    }),
  );
  const d = { ...P.defaults, ...M.defaults, ...G.defaults };
  assert.equal(app.cfg.pitchSens, d.pitchSens);
  assert.equal(app.cfg.yawSens, d.yawSens);
  assert.equal(app.cfg.vehicleMultiplier, d.vehicleMultiplier);
  assert.equal(app.cfg.invertY, d.invertY);
  assert.notEqual(app.cfg.scenario, 'hack');
  assert.notEqual(app.cfg.difficulty, 'god');
  assert.notEqual(app.cfg.graphics, 'ultra');
  assert.equal(app.cfg.mouseLaw, 'rate');
  assert.ok(!('madeUp' in app.cfg), 'unknown key dropped');
  await importProfile(
    profile({
      pitchSens: 1e308,
      yawSens: -1e308,
      vehicleMultiplier: 1e308,
      targetCount: 1e9,
      aaLaunchers: -3,
      duelBots: 1e9,
    }),
  );
  assert.equal(app.cfg.pitchSens, Number(el('pitchSens').max), 'clamped to the control maximum');
  assert.equal(app.cfg.yawSens, Number(el('yawSens').min), 'clamped to the control minimum');
  assert.equal(app.cfg.vehicleMultiplier, Number(el('vehicleMultiplier').max));
  assert.equal(app.cfg.targetCount, 8);
  assert.equal(app.cfg.aaLaunchers, 1);
  assert.equal(app.cfg.duelBots, 3);
  for (const [k, x] of Object.entries(app.cfg)) if (typeof x === 'number') assert.ok(Number.isFinite(x), k + ' finite');
});

test('bindings outside the key pattern are refused; two actions on one key are refused with a notice', async () => {
  await importProfile(profile({}, { fire: '<img src=x onerror=alert(1)>' }));
  assert.notEqual(app.bindings.fire, '<img src=x onerror=alert(1)>');
  const before = app.bindings.fire;
  await importProfile(profile({}, { fire: 'KeyQ', flares: 'KeyQ' }));
  assert.match(toast(), REFUSED, 'duplicate binding refused');
  assert.equal(app.bindings.fire, before, 'bindings unchanged');
});

test('the light preset id is looked up among its own keys: "constructor" or "toString" fall back (R5.1)', async () => {
  for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    await importProfile(profile({ lighting: id }));
    assert.equal(app.cfg.lighting, 'random', 'lighting ' + id + ' refused');
  }
  // applyLight falls back to the reference light for any id that is not its own preset.
  app.applyLight('constructor');
  assert.ok(Object.hasOwn(S.modules.W.LIGHTS, app.lightName), 'light ' + app.lightName);
});

test('aaFuse is clamped to 1-20 m and aaMinRange to 0-1000 m (R5.2)', async () => {
  await importProfile(profile({ aaFuse: 1e6, aaMinRange: -50 }));
  assert.equal(app.cfg.aaFuse, 20);
  assert.equal(app.cfg.aaMinRange, 0);
  await importProfile(profile({ aaFuse: -3, aaMinRange: 1e308 }));
  assert.equal(app.cfg.aaFuse, 1);
  assert.equal(app.cfg.aaMinRange, 1000);
  await importProfile(profile({ aaFuse: 7.5, aaMinRange: 250 }));
  assert.deepEqual([app.cfg.aaFuse, app.cfg.aaMinRange], [7.5, 250], 'values inside the bounds are kept');
});

test('retired options have no control and always take their default, whatever a profile holds (R5.6)', async () => {
  const retired = { cameraMotion: 0.8, speedFov: 10, stability: 2, hoverAssist: 1, drag: 0.1, dpi: 1600 };
  await importProfile(profile(retired));
  const d = { ...P.defaults, ...M.defaults, ...G.defaults };
  for (const k of Object.keys(retired)) {
    assert.equal(app.cfg[k], d[k], k + ' forced to its default');
    assert.ok(!S.elements.get(k), k + ' has no control');
  }
});

test('every imported number ends inside a declared range: its control, a whitelist or an explicit bound (R5.2)', async () => {
  const d = { ...P.defaults, ...M.defaults, ...G.defaults };
  const numeric = Object.keys(app.cfg).filter((k) => typeof app.cfg[k] === 'number');
  for (const extreme of [1e300, -1e300]) {
    await importProfile(profile(Object.fromEntries(numeric.map((k) => [k, extreme]))));
    for (const k of numeric) {
      const v = app.cfg[k];
      const e = S.elements.get(k);
      assert.ok(Number.isFinite(v), k + ' finite');
      if (e && e.tagName === 'INPUT' && e.min !== '')
        assert.ok(v >= Number(e.min) && v <= Number(e.max), `${k} = ${v} outside its control`);
      else if (e && e.tagName === 'SELECT') assert.equal(v, d[k], k + ': a value outside the whitelist falls back');
      else assert.ok(Math.abs(v) < 1e6, `${k} = ${v}: a number without a control needs an explicit bound`);
    }
  }
});

test('the exported profile holds only its format, version, revision, settings and bindings (R5.3); it imports back', async () => {
  el('export').onclick();
  const text = await hooks.blob.text();
  const exp = JSON.parse(text);
  assert.deepEqual(Object.keys(exp), ['format', 'version', 'tuningRevision', 'settings', 'bindings']);
  assert.equal(exp.format, 'littlebird-trainer-profile');
  assert.deepEqual(exp.settings, JSON.parse(JSON.stringify(app.cfg)));
  await importProfile(text);
  assert.equal(toast(), 'Profil importé.');
});

test("the game's settings file: over 400 kB refused; hostile values only reach text, never HTML; CRLF and BOM accepted; absurd values clamped", async () => {
  await importIni('RotaryMousePitchSensitivity=30\n' + 'x'.repeat(400001));
  assert.match(toast(), REFUSED, 'over 400 kB');
  const hostile =
    '﻿[/Script/WDGame.WDUserSettings]\r\nRotaryMousePitchSensitivity=1000000000\r\nRotaryMouseYawSensitivity=-5\r\nRotaryMouseXFunction=<img src=x onerror=alert(1)>\r\n';
  await importIni(hostile);
  assert.equal(el('toast').innerHTML, '', 'the notice is text only');
  assert.ok(toast().includes('<img'), 'the hostile value is shown as text');
  assert.equal(app.cfg.pitchSens, Number(el('pitchSens').max), '1e9 clamped');
  assert.equal(app.cfg.yawSens, Number(el('yawSens').min), '-5 clamped');
});

test("the game's settings file is read inside its helicopter section only (R5.8)", async () => {
  const before = app.cfg.pitchSens;
  await importIni('[/Script/Other.Section]\nRotaryMousePitchSensitivity=44.000000\n');
  assert.equal(app.cfg.pitchSens, before, 'a key outside the section is ignored');
  assert.match(toast(), REFUSED, 'nothing found: refused');
  await importIni(
    'RotaryMouseYawSensitivity=41\n[/Script/WDGame.WDUserSettings]\nRotaryMousePitchSensitivity=44.000000\n[/Script/Next]\nRotaryMouseYawSensitivity=42\n',
  );
  assert.equal(app.cfg.pitchSens, 44, 'the key inside the section is read');
  assert.notEqual(app.cfg.yawSens, 41, 'before the section: ignored');
  assert.notEqual(app.cfg.yawSens, 42, 'after the section: ignored');
});

test('a stored profile that is not JSON, or of the wrong types: the application boots with the defaults', () => {
  for (const raw of ['{not json', '[1,2,3]', '"text"', '{"version":1,"settings":[],"bindings":7}']) {
    const C = bootApp({ storage: { [PROFILE_KEY]: raw } });
    assert.equal(C.app.cfg.pitchSens, P.defaults.pitchSens, raw);
    assert.equal(C.el('start').disabled, false, raw);
  }
});

test('a stored profile with two actions on one key keeps its valid settings; its bindings fall back to the defaults', () => {
  const C = bootApp({
    profile: {
      version: 1,
      tuningRevision: 16,
      settings: { ...P.defaults, ...M.defaults, pitchSens: 33 },
      bindings: { fire: 'KeyQ', flares: 'KeyQ' },
    },
  });
  assert.equal(C.app.cfg.pitchSens, 33);
  assert.notEqual(C.app.bindings.fire, C.app.bindings.flares);
});
