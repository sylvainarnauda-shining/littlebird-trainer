'use strict';
// HeliSettings.parseGameIni: the helicopter settings of a game settings file, read from one section only, as plain data
// ({ settings, found, warn }): nothing is applied here (the page assigns, then sanitizes). The files are built here with
// an invented section name and neutral values; the page's own import test (app-settings-io) reads the synthetic sample.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/runtime');

const S = load('settings.js');
const SECTION = 'Sample.Settings';
const LINES = (values) => Object.entries(values).map(([key, value]) => `${key}=${value}`);
const file = (values, { before = [], after = [], eol = '\n', section = SECTION } = {}) =>
  [...before, `[${section}]`, ...LINES(values), ...after].join(eol);
const parse = (text, section = SECTION) => S.parseGameIni(text, section);
const FULL = {
  RotaryMousePitchSensitivity: '35.000000',
  RotaryMouseYawSensitivity: '12.000000',
  AirVehicleSensitivityMultiplier: '0.750000',
  bInvertYAxisHelicopters: 'False',
  RotaryMouseAxisIsolation: '0.000000',
  FirstPersonVehicleFieldOfView: '90.000000',
  ThirdPersonVehicleFieldOfView: '75.000000',
  RotaryMouseXFunction: 'Yaw',
  RotaryMouseYFunction: 'Pitch',
};

test('the seven helicopter settings are read in the units of the trainer, with the labels the page reports', () => {
  const r = parse(file(FULL));
  assert.deepEqual(r.settings, {
    pitchSens: 35,
    yawSens: 12,
    vehicleMultiplier: 0.75,
    invertY: false,
    isolation: 0,
    fovCockpit: 90,
    fovChase: 75,
  });
  assert.deepEqual(r.found, [
    'tangage 35 %',
    'lacet 12 %',
    'multiplicateur ×0.75',
    'axe normal',
    'isolation 0',
    'champ pilote 90°',
    'champ poursuite 75°',
  ]);
  assert.equal(r.warn, '');
});

test('an inverted axis is "True"; anything else reads as normal', () => {
  assert.deepEqual(parse(file({ bInvertYAxisHelicopters: 'True' })).settings, { invertY: true });
  assert.deepEqual(parse(file({ bInvertYAxisHelicopters: 'True' })).found, ['axe inversé']);
  for (const value of ['False', 'true', '1', 'yes', ''])
    assert.deepEqual(
      parse(file({ bInvertYAxisHelicopters: value })).settings,
      { invertY: false },
      JSON.stringify(value),
    );
});

test('a key that is missing is not reported; a file with none of them reads nothing', () => {
  const r = parse(file({ RotaryMouseYawSensitivity: '20', AirVehicleSensitivityMultiplier: '1.5' }));
  assert.deepEqual(r.settings, { yawSens: 20, vehicleMultiplier: 1.5 });
  assert.deepEqual(r.found, ['lacet 20 %', 'multiplicateur ×1.5']);
  for (const text of ['', file({}), file({ SomethingElse: '4' }), 'no section at all']) {
    const none = parse(text);
    assert.deepEqual(none.settings, {});
    assert.deepEqual(none.found, []);
  }
});

test('values that are not finite numbers are ignored, values that parse are returned as read (sanitize bounds them later)', () => {
  for (const value of ['abc', '', 'NaN', 'Infinity', '-Infinity', '1e999'])
    assert.deepEqual(parse(file({ RotaryMousePitchSensitivity: value })).settings, {}, JSON.stringify(value));
  assert.equal(parse(file({ RotaryMousePitchSensitivity: '  42.5  ' })).settings.pitchSens, 42.5);
  assert.equal(parse(file({ RotaryMousePitchSensitivity: '-7' })).settings.pitchSens, -7);
  assert.equal(parse(file({ RotaryMousePitchSensitivity: '1e308' })).settings.pitchSens, 1e308);
  assert.equal(S.sanitize(parse(file({ RotaryMousePitchSensitivity: '1e308' })).settings).pitchSens, 100);
});

test('only the named section is read: its header must be the whole line, and the section ends at the next header', () => {
  const values = { RotaryMousePitchSensitivity: '35' };
  const decoy = { RotaryMousePitchSensitivity: '99', RotaryMouseYawSensitivity: '98' };
  const text = file(values, {
    before: ['[Other.Section]', ...LINES(decoy)],
    after: ['[Later.Section]', ...LINES(decoy)],
  });
  assert.deepEqual(parse(text).settings, { pitchSens: 35 });
  assert.deepEqual(
    parse(text, 'Other.Section').found,
    ['tangage 99 %', 'lacet 98 %'],
    'the same text read for another section',
  );
  assert.deepEqual(
    parse(file(values, { section: 'Sample.Settings2' })).settings,
    {},
    'a longer name is another section',
  );
  assert.deepEqual(parse(file(values, { section: 'Prefix.Sample.Settings' })).settings, {});
  assert.deepEqual(
    parse(`${LINES(values).join('\n')}\n${file({})}`).settings,
    {},
    'lines before the header are not in it',
  );
});

test('a key is read where a line starts with it and "=" follows at once, the first time it appears', () => {
  const text = file({ RotaryMousePitchSensitivityX: '9', ' RotaryMouseYawSensitivity': '9' }, { after: ['x'] });
  assert.deepEqual(parse(text).settings, {});
  assert.deepEqual(
    parse(file({ RotaryMousePitchSensitivity: '5' }, { after: ['RotaryMousePitchSensitivity=6'] })).settings,
    { pitchSens: 5 },
  );
  assert.deepEqual(
    parse(file({}, { after: [';RotaryMousePitchSensitivity=6', '#RotaryMouseYawSensitivity=7'] })).settings,
    {},
  );
});

test('a byte order mark, Windows line ends and trailing spaces on the header are read like plain text', () => {
  const plain = parse(file(FULL));
  assert.deepEqual(parse('﻿' + file(FULL, { eol: '\r\n' })), plain);
  assert.deepEqual(parse(file(FULL).replace(`[${SECTION}]`, `[${SECTION}]   `)), plain);
  assert.deepEqual(parse('﻿' + file(FULL, { before: ['[A]'], eol: '\r\n' })), plain);
});

test('the mouse axes of the file must be yaw and pitch, as the trainer flies them, or a warning says so', () => {
  assert.equal(parse(file({ RotaryMouseXFunction: 'Yaw', RotaryMouseYFunction: 'Pitch' })).warn, '');
  assert.equal(parse(file({})).warn, '');
  const x = parse(file({ RotaryMouseXFunction: 'Roll', RotaryMouseYFunction: 'Pitch' })).warn;
  assert.match(x, /Attention/);
  assert.match(x, /souris X = Roll et Y = Pitch/);
  assert.match(parse(file({ RotaryMouseXFunction: 'Yaw', RotaryMouseYFunction: 'Throttle' })).warn, /Y = Throttle/);
});

test('whatever the text is, it is read as text; the result is plain data', () => {
  for (const text of [undefined, null, 42, {}, [], ['[Sample.Settings]']]) {
    const r = parse(text);
    assert.deepEqual(r.settings, {});
    assert.deepEqual(r.found, []);
  }
  const r = parse(file(FULL));
  assert.equal(Object.getPrototypeOf(r.settings), Object.prototype);
  assert.equal(JSON.stringify(r), JSON.stringify(parse(file(FULL))), 'pure: same text, same result');
});
