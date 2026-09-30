'use strict';
// Provenance of the runtime (gates G0 and G1). The vendored three.js files stay byte-identical to the frozen
// baseline (tests/fixtures/baseline-manifest.json). The game's own sources were imported byte for byte (G0, first
// commit) and have since changed only through gated steps: comment and wording steps keep their syntax trees
// (scripts/ast-identity.mjs, G1, run against the previous commit), behaviour steps re-record the goldens with a
// declared reason (CHANGELOG.md). The goldens name every runtime file they were recorded on.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, FIXTURES, GOLDEN, SRC } = require('../helpers/paths');

const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'baseline-manifest.json'), 'utf8'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

test('G0 the vendored three.js files equal the frozen baseline byte for byte', () => {
  const vendor = manifest.files.filter((f) => f.file.startsWith('src/vendor/'));
  assert.equal(vendor.length, 2);
  for (const f of vendor) assert.equal(sha(fs.readFileSync(path.join(ROOT, f.file))), f.sha256, f.file);
});

test('every runtime file has LF line endings', () => {
  for (const f of manifest.files) {
    if (f.file.startsWith('src/vendor/')) continue;
    assert.ok(!fs.readFileSync(path.join(ROOT, f.file)).includes(13), f.file + ' has LF line endings');
  }
});

test('the goldens name every runtime file the recorder reads (meta.json srcManifest)', () => {
  const meta = JSON.parse(fs.readFileSync(path.join(GOLDEN, 'meta.json'), 'utf8'));
  for (const name of Object.keys(meta.srcManifest)) assert.ok(fs.existsSync(path.join(SRC, name)), name);
  assert.equal(Object.keys(meta.srcManifest).length, 12);
});
