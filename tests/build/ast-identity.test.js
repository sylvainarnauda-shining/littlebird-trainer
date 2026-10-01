'use strict';
// Gate G1 tool (scripts/ast-identity.mjs): syntax trees compared without comments and positions; with the strings
// masked for a wording step, every changed string listed; the page template compared as markup.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT, SRC } = require('../helpers/paths');
const { templateScriptFiles } = require('../helpers/html');

const load = () => import(pathToFileURL(path.join(ROOT, 'scripts', 'ast-identity.mjs')).href);

test('comments, whitespace and line endings change no tree; code, numbers and names do', async () => {
  const { compareScripts } = await load();
  const a = 'const x=1; // one\nfunction f(a){return a+x;} /* block */\n';
  assert.ok(compareScripts(a, '/* header */\nconst x = 1;\r\nfunction f(a) {\n  return a + x; // same\n}\n').identical);
  assert.ok(
    !compareScripts(a, 'const x=1.0;function f(a){return a+x;}').identical,
    'a number literal written differently',
  );
  assert.ok(!compareScripts(a, 'const y=1;function f(a){return a+y;}').identical, 'a renamed identifier');
  assert.ok(!compareScripts(a, 'const x=1;function f(a){return x+a;}').identical, 'operands swapped');
});

test('a string change is a difference, unless the strings are masked, and then it is listed', async () => {
  const { compareScripts } = await load();
  const a = "toast('Profil importé.');const t=`n ${x} m`;";
  const b = "toast('Profil chargé.');const t=`n ${x} km`;";
  assert.ok(!compareScripts(a, b).identical);
  const r = compareScripts(a, b, { maskStrings: true });
  assert.ok(r.identical);
  assert.deepEqual(r.strings, [
    { from: 'Profil importé.', to: 'Profil chargé.' },
    { from: ' m', to: ' km' },
  ]);
  assert.ok(!compareScripts(a, "toast('x');const t=`n ${y} m`;", { maskStrings: true }).identical, 'code still strict');
});

test('template: markup strict, text and wording attributes masked and listed', async () => {
  const { compareTemplates } = await load();
  const a =
    '<p id="a" class="muted">Bonjour <b>toi</b></p><!-- note --><canvas aria-label="Carte"></canvas><script>var x=1;</script>';
  const b =
    '<p id="a" class="muted">Salut   <b>vous</b></p><canvas aria-label="Aperçu"></canvas><script>var x = 1; // c\n</script>';
  assert.ok(!compareTemplates(a, b).identical);
  const r = compareTemplates(a, b, { maskStrings: true });
  assert.ok(r.identical);
  assert.deepEqual(
    r.strings.map((s) => s.to),
    ['Salut', 'vous', 'Aperçu'],
  );
  assert.ok(
    !compareTemplates(a, b.replace('class="muted"', 'class="note"'), { maskStrings: true }).identical,
    'attributes strict',
  );
  assert.ok(
    !compareTemplates(a, b.replace('var x = 1', 'var x = 2'), { maskStrings: true }).identical,
    'inline script strict',
  );
});

test('the files compared by default are the scripts the template names, three.js apart', async () => {
  const { RUNTIME, TEMPLATE } = await load();
  const named = templateScriptFiles(fs.readFileSync(path.join(SRC, TEMPLATE), 'utf8'));
  assert.deepEqual(
    RUNTIME,
    named.filter((f) => f !== 'vendor/three.min.js'),
  );
  assert.ok(RUNTIME.includes('app.js') && RUNTIME.includes('core/pow.js'));
});
