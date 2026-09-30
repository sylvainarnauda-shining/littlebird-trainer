'use strict';
// The vendored three.js r160 build is byte for byte the pinned file (sha256 in publish-policy.json), with its MIT
// license beside it and its @license header kept (it survives inlining into the page).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
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
