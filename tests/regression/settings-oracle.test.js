'use strict';
// The settings oracle (tools/golden/suites/settings.cjs) draws its profiles from frozen bounds and choices, and hashes the
// profile blocks added after 0.9 (prefs, secondary) only when the runtime exposes them and they differ from a fresh page's.
// The record cannot show either (the goldens are byte-identical, golden.mjs prove shows that): these tests pin the data of
// the generator and the rule for the phase that adds the first block.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { RECORDER, SRC, TEMPLATE } = require('../helpers/paths');

const { Hasher } = require(path.join(RECORDER, 'canon.cjs'));
const { loadRuntime, createPage } = require(path.join(RECORDER, 'harness.cjs'));
const { RANGES, ENUMS, blockDigests, encodeBlocks } = require(path.join(RECORDER, 'suites', 'settings.cjs'));

test('the frozen bounds and choices name settings of the page, with the type they are drawn for', async () => {
  const { cfg } = (await createPage(loadRuntime({ src: SRC, template: TEMPLATE }), { audio: false })).app;
  for (const [key, [min, max, step]] of Object.entries(RANGES)) {
    assert.equal(typeof cfg[key], 'number', key);
    assert.ok(min < max && step > 0 && step <= max - min, `${key}: ${min}, ${max}, ${step}`);
  }
  for (const [key, choices] of Object.entries(ENUMS)) {
    assert.equal(typeof cfg[key], 'string', key);
    assert.ok(
      choices.length > 1 && new Set(choices).size === choices.length,
      key + ': two choices at least, each once',
    );
  }
});

const freshApp = { prefs: { schema: 1, rotaryMouse: false }, secondary: {} };
const fresh = blockDigests(freshApp);
const nothing = new Hasher().digest();
const hashed = (app) => {
  const h = new Hasher();
  encodeBlocks(h, app, fresh);
  return h.digest();
};

test('a runtime that exposes no block adds nothing', () => {
  assert.equal(hashed({ cfg: {} }), nothing);
});

test('a block left at its default adds nothing, whatever its key order', () => {
  assert.equal(hashed({ prefs: { rotaryMouse: false, schema: 1 }, secondary: {} }), nothing);
});

test('a block that differs adds itself, and only itself', () => {
  const prefs = hashed({ prefs: { schema: 1, rotaryMouse: true }, secondary: {} });
  const secondary = hashed({ prefs: freshApp.prefs, secondary: { yawLeft: 'ArrowLeft' } });
  assert.notEqual(prefs, nothing);
  assert.notEqual(secondary, nothing);
  assert.notEqual(prefs, secondary);
  assert.notEqual(hashed({ prefs: { schema: 1, rotaryMouse: 'other' }, secondary: {} }), prefs, 'its value counts');
  assert.equal(hashed({ prefs: { schema: 1, rotaryMouse: true } }), prefs, 'a block the runtime lacks adds nothing');
});
