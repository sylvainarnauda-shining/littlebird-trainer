'use strict';
// HeliSettings.sanitize: the settings of a profile as the page can use them, without a DOM. The bounds are the table of
// settings-data.js, equal to the page's slider attributes for as long as the template holds them (the page 0.9 read them
// from its inputs: the golden settings oracle proves the two give the same answer on 10 000 profiles). Also: the two
// scripts are free of DOM, clock and random draws, and work from the page's globals as well as from require().
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');
const { load, modules, SRC } = require('../helpers/runtime');
const { TEMPLATE } = require('../helpers/paths');

const S = load('settings.js');
const { BOUNDS, defaults } = S;
const { W } = modules();
const numeric = Object.keys(defaults).filter((k) => typeof defaults[k] === 'number');

// The page's range inputs: id -> [min, max, step] as the template writes them.
function templateRanges() {
  const html = fs.readFileSync(TEMPLATE, 'utf8');
  const ranges = {};
  for (const [tag] of html.matchAll(/<input\b[^>]*>/g)) {
    const attr = (name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
    if (attr('type') === 'range') ranges[attr('id')] = [attr('min'), attr('max'), attr('step')].map(Number);
  }
  return ranges;
}

test('BOUNDS are the template slider attributes of every numeric setting that has a slider', () => {
  const ranges = templateRanges();
  const expected = Object.fromEntries(Object.entries(ranges).filter(([id]) => numeric.includes(id)));
  assert.equal(Object.keys(BOUNDS).length, 71);
  assert.deepEqual(BOUNDS, expected);
  // The sliders left out are the joystick panel's (a block of their own, validated by physics.js).
  const left = Object.keys(ranges).filter((id) => !(id in BOUNDS));
  assert.ok(left.length > 0 && left.every((id) => id.startsWith('joy')), left.join());
});

test('every bound is a proper range: min < max, a positive step, a default inside', () => {
  for (const [key, [min, max, step]] of Object.entries(BOUNDS)) {
    assert.ok(min < max && step > 0, key);
    assert.ok(defaults[key] >= min && defaults[key] <= max, `${key}: default ${defaults[key]} in ${min}..${max}`);
  }
});

test('anything that is not an object gives the defaults, as a copy', () => {
  for (const data of [undefined, null, 0, 'text', true, false]) {
    const out = S.sanitize(data);
    assert.deepEqual(out, defaults);
    assert.notEqual(out, defaults);
  }
  assert.deepEqual(S.sanitize({}), defaults);
  assert.deepEqual(Object.keys(S.sanitize({ unknown: 1 })), Object.keys(defaults));
});

test('a number is clamped to its bounds; a step of 1 or more also rounds it to an integer', () => {
  for (const [key, [min, max, step]] of Object.entries(BOUNDS)) {
    assert.equal(S.sanitize({ [key]: min - 1e6 })[key], min, key + ' below');
    assert.equal(S.sanitize({ [key]: max + 1e6 })[key], max, key + ' above');
    const inside = min + (max - min) * 0.37;
    const kept = S.sanitize({ [key]: inside })[key];
    assert.equal(kept, step >= 1 ? Math.round(inside) : inside, key + ' inside');
  }
  assert.equal(S.sanitize({ pitchSens: 12.4 }).pitchSens, 12);
  assert.equal(S.sanitize({ pitchSens: 12.5 }).pitchSens, 13);
  assert.equal(S.sanitize({ aaLockRange: 1000.4 }).aaLockRange, 1000, 'rounds to an integer, not to the step of 50');
  assert.equal(S.sanitize({ volume: 0.2234 }).volume, 0.2234, 'a step below 1 does not round');
});

test('hostile numbers: not finite or not a number keeps the default, huge ones are clamped, -0 passes as it did', () => {
  for (const value of [NaN, Infinity, -Infinity, '12', true, null, [1], { v: 1 }, '']) {
    assert.equal(S.sanitize({ pitchSens: value }).pitchSens, defaults.pitchSens, String(value));
  }
  assert.equal(S.sanitize({ pitchSens: 1e308 }).pitchSens, 100);
  assert.equal(S.sanitize({ pitchSens: -1e308 }).pitchSens, 1);
  assert.equal(S.sanitize({ pitchSens: 5e-324 }).pitchSens, 1);
  assert.equal(S.sanitize({ pitchSens: 2 ** 53 + 2 }).pitchSens, 100);
  // Math.max(0, -0) is 0 but Math.max(-0.4, -0) is -0: the clamp keeps the sign the old page's clamp kept.
  assert.ok(Object.is(S.sanitize({ holdGain: -0 }).holdGain, 0));
  assert.ok(Object.is(S.sanitize({ leverHover: -0 }).leverHover, -0));
});

test('booleans and words: the right type is kept, any other value keeps the default', () => {
  assert.equal(S.sanitize({ showMinimap: false }).showMinimap, false);
  assert.equal(S.sanitize({ showMinimap: 'false' }).showMinimap, defaults.showMinimap);
  assert.equal(S.sanitize({ showMinimap: 0 }).showMinimap, defaults.showMinimap);
  const choices = {
    scenario: ['air', 'ground', 'mixed', 'free', 'towers', 'missiles', 'assault', 'match', 'duel'],
    rangeType: ['air', 'ground', 'mixed'],
    trajectory: ['cross', 'circle', 'zigzag', 'static', 'evasive'],
    aaObjective: ['survive', 'destroy'],
    graphics: ['high', 'medium', 'low'],
    difficulty: ['easy', 'normal', 'real'],
    duelStart: ['front', 'behind', 'random'],
    duelEnemy: ['ah6m', 'ah6r', 'mix'],
    mouseLaw: ['rate', 'stick'],
  };
  for (const [key, list] of Object.entries(choices)) {
    for (const value of list) assert.equal(S.sanitize({ [key]: value })[key], value, `${key} ${value}`);
    for (const value of ['', 'HIGH', 'joystick', 'constructor', 7, null])
      assert.equal(S.sanitize({ [key]: value })[key], defaults[key], `${key} ${String(value)}`);
  }
});

test('a light is "random" or one of the world presets by its own name, never an inherited property', () => {
  for (const name of ['random', ...Object.keys(W.LIGHTS)]) assert.equal(S.sanitize({ lighting: name }).lighting, name);
  for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'unknown'])
    assert.equal(S.sanitize({ lighting: name }).lighting, defaults.lighting, name);
});

test('retired options are always their default; unknown and inherited keys are dropped', () => {
  const out = S.sanitize({ cameraMotion: 0.35, speedFov: 5, stability: 1, hoverAssist: 1, drag: 2, dpi: 3 });
  for (const key of S.RETIRED) assert.equal(out[key], defaults[key], key);
  const hostile = JSON.parse('{"__proto__":{"scenario":"duel"},"constructor":{"prototype":{"x":1}},"evil":1}');
  const clean = S.sanitize(hostile);
  assert.equal(clean.scenario, defaults.scenario);
  assert.deepEqual(Object.keys(clean), Object.keys(defaults));
  assert.equal(Object.getPrototypeOf(clean), Object.prototype);
});

test('the choices without a control: duration, impact damage (earlier values map to the nearest), hits to kill, fuse, minimum range', () => {
  for (const duration of [0, 60, 120, 300, 600, 900]) assert.equal(S.sanitize({ duration }).duration, duration);
  for (const duration of [45, -1, 1e9]) assert.equal(S.sanitize({ duration }).duration, 120);
  for (const impactDamage of [0, 18.01, 30.01, 36.01, 54.02, 74.12, 78.01, 85.81, 150.02])
    assert.equal(S.sanitize({ impactDamage }).impactDamage, impactDamage);
  assert.equal(S.sanitize({ impactDamage: 30.02 }).impactDamage, 30.01);
  assert.equal(S.sanitize({ impactDamage: 36.02 }).impactDamage, 36.01);
  assert.equal(S.sanitize({ impactDamage: 99 }).impactDamage, defaults.impactDamage);
  for (const aaHitsToKill of [0, 1, 2, 3]) assert.equal(S.sanitize({ aaHitsToKill }).aaHitsToKill, aaHitsToKill);
  for (const aaHitsToKill of [4, -1, 1.5]) assert.equal(S.sanitize({ aaHitsToKill }).aaHitsToKill, 0);
  assert.deepEqual(
    [S.sanitize({ aaFuse: 0 }).aaFuse, S.sanitize({ aaFuse: 99 }).aaFuse, S.sanitize({ aaFuse: 8 }).aaFuse],
    [1, 20, 8],
  );
  assert.deepEqual(
    [
      S.sanitize({ aaMinRange: -5 }).aaMinRange,
      S.sanitize({ aaMinRange: 5e3 }).aaMinRange,
      S.sanitize({ aaMinRange: 250 }).aaMinRange,
    ],
    [0, 1000, 250],
  );
});

test('sanitize does not change its argument and is idempotent', () => {
  const data = { pitchSens: 12.6, lighting: 'nope', fovCockpit: 500, cameraMotion: 1 };
  const frozen = JSON.stringify(data);
  const once = S.sanitize(data);
  assert.equal(JSON.stringify(data), frozen);
  assert.deepEqual(S.sanitize(once), once);
});

test('settings.js and settings-data.js read no DOM, no storage, no clock and draw nothing at random', () => {
  const { tokenizer, tokTypes } = acorn;
  const forbidden = new Set([
    'document',
    'localStorage',
    'sessionStorage',
    'Date',
    'performance',
    'getElementById',
    'querySelector',
  ]);
  for (const file of ['settings.js', 'settings-data.js']) {
    const tokens = [...tokenizer(fs.readFileSync(path.join(SRC, file), 'utf8'), { ecmaVersion: 'latest' })];
    const names = tokens.filter((t) => t.type === tokTypes.name);
    assert.deepEqual(
      names.filter((t) => forbidden.has(t.value)).map((t) => t.value),
      [],
      file,
    );
    const random = tokens.findIndex(
      (t, i) => t.value === 'Math' && tokens[i + 1]?.type === tokTypes.dot && tokens[i + 2]?.value === 'random',
    );
    assert.equal(random, -1, file + ' draws with Math.random');
  }
});

test('from the page globals (no require), the module gives the same answers as from Node', () => {
  const m = modules();
  const page = {
    HeliPhysics: m.P,
    HeliMissiles: m.M,
    HeliGround: m.G,
    HeliWorld: m.W,
    HeliSettingsData: load('settings-data.js'),
  };
  page.window = page;
  vm.createContext(page);
  vm.runInContext(fs.readFileSync(path.join(SRC, 'settings.js'), 'utf8'), page, { filename: 'settings.js' });
  assert.ok(page.HeliSettings && typeof page.HeliSettings.sanitize === 'function');
  const data = {
    pitchSens: 12.6,
    fovCockpit: 500,
    lighting: 'constructor',
    duelBots: 2.6,
    scenario: 'duel',
    showMinimap: false,
  };
  assert.equal(JSON.stringify(page.HeliSettings.sanitize(data)), JSON.stringify(S.sanitize(data)));
});
