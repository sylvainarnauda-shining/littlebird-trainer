'use strict';
// The vendored three.js r160 build is byte for byte the pinned file (sha256 in publish-policy.json), with its MIT
// license beside it and its @license header kept (it survives inlining into the page). Its ** operators are exactly the
// two squares the golden recorder evaluates as products (tools/golden/harness.cjs), so that no power of three.js's
// realm depends on the platform's C library during a recording.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const { ROOT, SRC } = require('../helpers/paths');

test('src/vendor/three.min.js matches the pinned sha256; license text and header present', () => {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'publish-policy.json'), 'utf8'));
  const pinned = policy.vendorChecksums['src/vendor/three.min.js'];
  const buf = fs.readFileSync(path.join(SRC, 'vendor', 'three.min.js'));
  assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), pinned);
  const head = buf.toString('utf8', 0, 400);
  assert.match(head, /@license/);
  assert.match(head, /SPDX-License-Identifier: MIT/);
  const license = fs.readFileSync(path.join(SRC, 'vendor', 'three.LICENSE.txt'), 'utf8');
  assert.match(license, /The MIT License/);
});

test("three.js's ** operators are the two squares the golden recorder evaluates as products", () => {
  const { THREE_SQUARES, threeSource } = require(path.join(ROOT, 'tools', 'golden', 'harness.cjs'));
  const text = fs.readFileSync(path.join(SRC, 'vendor', 'three.min.js'), 'utf8');
  const operators = (source) =>
    [...acorn.tokenizer(source, { ecmaVersion: 2022 })].filter((t) => t.value === '**' || t.value === '**=');
  const found = operators(text).map((t) => t.start);
  assert.equal(found.length, THREE_SQUARES.length, 'one ** operator per listed square');
  for (const [from] of THREE_SQUARES) {
    const at = text.indexOf(from);
    assert.ok(at >= 0 && found.includes(at + from.indexOf('**')), 'the listed square is an operator: ' + from);
  }
  const rewritten = threeSource(text);
  assert.deepEqual(operators(rewritten), [], 'no ** left in the recorder realm');
  assert.equal(rewritten.length, text.length + THREE_SQUARES.reduce((n, [a, b]) => n + b.length - a.length, 0));
  assert.throws(() => threeSource(text + ';var q=2**3;'), /\*\* operator\(s\) left/);
  assert.throws(() => threeSource(text.replace(THREE_SQUARES[0][0], 'x')), /found 0 time\(s\)/);
});
