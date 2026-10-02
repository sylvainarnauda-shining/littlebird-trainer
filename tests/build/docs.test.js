'use strict';
// The documentation stays tied to the code: every docs/ page a source file, test or script points to exists; the
// README carries the unofficial / not-affiliated disclaimer in French and English; the changelog declares every
// behaviour step of the publication prep; the default keys of docs/REGLAGES.md are the application's.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/paths');
const { load } = require('../helpers/runtime');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
function files(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) {
      if (!['vendor', 'fixtures'].includes(e.name)) files(p, out);
    } else if (/\.(c?js|mjs|html|md)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('every docs/ page the sources, tests, scripts and docs point to exists', () => {
  const refs = new Set();
  for (const f of [...files('src'), ...files('tests'), ...files('scripts'), ...files('tools'), ...files('docs')]) {
    for (const m of read(f).matchAll(/\bdocs\/[A-Za-z0-9_/.-]+?\.md\b/g)) refs.add(m[0]);
  }
  assert.ok(refs.size >= 10, 'references found: ' + refs.size);
  for (const r of refs) assert.ok(fs.existsSync(path.join(ROOT, r)), r + ' exists');
});

test('every Markdown page a document links or names exists', () => {
  const docs = [...files('docs'), ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.md'))];
  let n = 0;
  for (const f of docs) {
    for (const m of read(f).matchAll(/(?:\]\(|`)((?:\.\.\/)*[A-Za-z0-9_/.-]+\.md)(?:\)|`)/g)) {
      const bases = [path.dirname(path.join(ROOT, f)), ROOT, path.join(ROOT, 'docs')];
      assert.ok(
        bases.some((b) => fs.existsSync(path.join(b, m[1]))),
        f + ' -> ' + m[1],
      );
      n++;
    }
  }
  assert.ok(n >= 20, 'links checked: ' + n);
});

test('the README carries the unofficial / not-affiliated disclaimer in French and English', () => {
  const readme = read('README.md');
  assert.match(readme, /ni affilié, ni approuvé, ni soutenu/);
  assert.match(readme, /not affiliated\s*(?:>\s*)?with, endorsed or sponsored by/);
  assert.match(readme, /appartiennent à leurs propriétaires respectifs/);
  for (const f of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CHANGELOG.md'])
    assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  assert.match(read('LICENSE'), /^MIT License\n\nCopyright \(c\) 2026 sylvainarnauda-shining and contributors\n/);
});

test('the changelog declares every behaviour step of the publication prep', () => {
  const log = read('CHANGELOG.md');
  for (const id of ['S8d', 'R2', 'R5.1', 'R5.2', 'R5.3', 'R5.4', 'R5.5', 'R5.5b', 'R5.6', 'R5.7', 'R5.8'])
    assert.ok(log.includes(id), id + ' in CHANGELOG.md');
});

test("docs/REGLAGES.md gives the application's default keys", () => {
  assert.deepEqual(load('settings.js').baseBindings, {
    collectiveUp: 'ShiftLeft',
    collectiveDown: 'ControlLeft',
    pitchUp: 'KeyS',
    pitchDown: 'KeyW',
    yawLeft: 'KeyQ',
    yawRight: 'KeyE',
    rollLeft: 'KeyA',
    rollRight: 'KeyD',
    fire: 'Mouse0',
    flares: 'KeyV',
    freeLook: 'AltLeft',
    shop: 'KeyB',
    view: 'KeyC',
    reset: 'KeyR',
    neutral: 'KeyX',
  });
  const doc = read('docs/REGLAGES.md');
  for (const row of [
    /Augmenter \/ réduire le collectif\s*\|\s*Maj gauche \/ Ctrl gauche/,
    /Piquer \/ cabrer\s*\|\s*W \/ S/,
    /Roulis gauche \/ droit\s*\|\s*A \/ D/,
    /Lacet gauche \/ droit\s*\|\s*Q \/ E/,
    /Tirer\s*\|\s*clic gauche/,
    /Leurres\s*\|\s*V/,
    /Changer de vue\s*\|\s*C/,
    /Regard libre\s*\|\s*Alt gauche/,
    /Ravitaillement sur l'hélipad\s*\|\s*B/,
    /Recommencer\s*\|\s*R/,
    /Recentrer la souris \(manche virtuel\)\s*\|\s*X/,
  ])
    assert.match(doc, row);
});
