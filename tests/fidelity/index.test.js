'use strict';
// Meta-test of gate G3: every fidelity check F01-F37 of tests/fidelity/INDEX.json is present once and tested in every
// file it names (a test whose title starts with its id), and every test titled with an F id is listed in the index.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/paths');

const index = JSON.parse(fs.readFileSync(path.join(__dirname, 'INDEX.json'), 'utf8'));
const titled = (text, id) => new RegExp(`\\b(?:test|it)\\(\\s*['"\`]${id}\\b`).test(text);

function testFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'fixtures' && e.name !== 'output') testFiles(p, out);
    } else if (/\.(test\.js|spec\.mjs)$/.test(e.name)) out.push(path.relative(ROOT, p).replace(/\\/g, '/'));
  }
  return out;
}

test('G3 the index lists F01-F37 once each, in order', () => {
  const ids = index.checks.map((c) => c.id);
  assert.deepEqual(
    ids,
    Array.from({ length: 37 }, (_, i) => 'F' + String(i + 1).padStart(2, '0')),
  );
  for (const c of index.checks) assert.ok(c.check && c.band && c.basis && c.files.length, c.id + ' complete');
});

test('G3 every check is tested in each file it names', () => {
  for (const c of [...index.checks, ...index.goldens]) {
    for (const f of c.files) {
      const p = path.join(ROOT, f);
      assert.ok(fs.existsSync(p), `${c.id}: ${f} exists`);
      if (c.id.startsWith('F'))
        assert.ok(titled(fs.readFileSync(p, 'utf8'), c.id), `${c.id}: a test titled "${c.id} ..." in ${f}`);
    }
  }
});

test('G3 every test titled with a fidelity id is listed in the index for its file', () => {
  const listed = new Set(index.checks.flatMap((c) => c.files.map((f) => c.id + ' ' + f)));
  let found = 0;
  for (const f of testFiles(path.join(ROOT, 'tests'))) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of text.matchAll(/\b(?:test|it)\(\s*['"`](F\d\d)\b/g)) {
      found++;
      assert.ok(listed.has(m[1] + ' ' + f), `${m[1]} in ${f} is not in INDEX.json`);
    }
  }
  assert.ok(found >= 37, 'fidelity tests found: ' + found);
});
