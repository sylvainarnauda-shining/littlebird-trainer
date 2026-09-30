'use strict';
// The Golden-Update protocol (scripts/check-golden-trailer.mjs, CI job golden-update): a change of the golden data needs
// a "Golden-Update: <reason>" line in the pull request description and a CHANGELOG.md entry; the provenance fields of
// meta.json (recorderManifest, srcManifest) and MANIFEST.json are not data; a recorder change alone is proven neutral.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT } = require('../helpers/paths');

const load = () => import(pathToFileURL(path.join(ROOT, 'scripts', 'check-golden-trailer.mjs')).href);
const G = 'tests/fixtures/golden/';
const meta = (extra = {}) =>
  JSON.stringify({
    recorder: 2,
    recorderManifest: { 'a.cjs': { sha256_lf: '1' } },
    srcManifest: { 'app.js': { sha256_lf: '2' } },
    suites: ['ui'],
    ...extra,
  });

test('no golden change: nothing required', async () => {
  const { goldenVerdict } = await load();
  const v = goldenVerdict({ changed: ['src/app.js', 'README.md'] });
  assert.deepEqual([v.ok, v.data, v.prove], [true, false, false]);
});

test('golden data changed: the trailer and a CHANGELOG entry are both required', async () => {
  const { goldenVerdict } = await load();
  let v = goldenVerdict({ changed: [G + 'ui.json', G + 'MANIFEST.json'], body: 'Reword a label' });
  assert.equal(v.ok, false);
  assert.equal(v.problems.length, 2);
  v = goldenVerdict({ changed: [G + 'ui.json', 'CHANGELOG.md'], body: 'Golden-Update: short' });
  assert.equal(v.ok, false, 'a reason of fewer than 10 characters');
  v = goldenVerdict({
    changed: [G + 'ui.json', G + 'MANIFEST.json', 'CHANGELOG.md'],
    body: 'Reword the chase label.\n\nGolden-Update: wording step of the chase-view label',
  });
  assert.deepEqual([v.ok, v.data], [true, true]);
});

test('meta.json: only its provenance fields may change without a declaration', async () => {
  const { goldenVerdict } = await load();
  const before = meta();
  let v = goldenVerdict({
    changed: [G + 'meta.json', G + 'MANIFEST.json'],
    meta: { before, after: meta({ srcManifest: { 'app.js': { sha256_lf: '3' } } }) },
  });
  assert.deepEqual([v.ok, v.data], [true, false]);
  v = goldenVerdict({
    changed: [G + 'meta.json', G + 'MANIFEST.json'],
    meta: { before, after: meta({ suites: ['ui', 'hud'] }) },
  });
  assert.deepEqual([v.ok, v.data], [false, true]);
});

test('a recorder change without golden data change must be proven neutral', async () => {
  const { goldenVerdict } = await load();
  const v = goldenVerdict({
    changed: ['tools/golden/canon.cjs', G + 'meta.json', G + 'MANIFEST.json'],
    meta: { before: meta(), after: meta({ recorderManifest: { 'a.cjs': { sha256_lf: '9' } } }) },
  });
  assert.deepEqual([v.ok, v.data, v.recorder, v.prove], [true, false, true, true]);
  const w = goldenVerdict({
    changed: ['tools/golden/canon.cjs', G + 'ui.json', 'CHANGELOG.md'],
    body: 'Golden-Update: recorder hashes a new field of the interface',
  });
  assert.deepEqual([w.ok, w.data, w.prove], [true, true, false], 'a declared update is not proven neutral');
});
