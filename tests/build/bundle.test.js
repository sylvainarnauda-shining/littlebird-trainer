'use strict';
// The built page (scripts/build.mjs): self-contained (no external script or stylesheet), the error handler and the
// eleven scripts inlined in order and all parseable, each inline body equal to its source file (LF), the automation
// pointer-lock shim present (the build refuses an app.js without it), the key page elements present, no network API or
// dynamic code in the game's own scripts, and the test hooks only read by the page, never defined by it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { ROOT, SRC } = require('../helpers/paths');

const importBuild = () => import(pathToFileURL(path.join(ROOT, 'scripts', 'build.mjs')).href);
const GAME = [
  'world.js',
  'physics.js',
  'forest.js',
  'scenery.js',
  'missiles.js',
  'audio.js',
  'models.js',
  'ground.js',
  'bot.js',
  'app.js',
];
const lf = (s) => s.replace(/\r\n?/g, '\n');

test('the page is self-contained: 12 inline scripts, all parseable, each equal to its source; styles inlined', async () => {
  const { buildPage, SCRIPTS } = await importBuild();
  const html = buildPage(SRC);
  assert.ok(!/<script\s+src=|<link[^>]+stylesheet/i.test(html), 'no external script or stylesheet');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(
    scripts.length,
    12,
    'error handler, three.js, world, physics, forest, scenery, missiles, audio, models, ground, bot, app',
  );
  for (const [i, body] of scripts.entries()) new vm.Script(body, { filename: 'inline-' + i + '.js' });
  SCRIPTS.forEach((f, i) => {
    const expected = '\n' + lf(fs.readFileSync(path.join(SRC, f), 'utf8')).replace(/<\/script/gi, '<\\/script') + '\n';
    assert.equal(scripts[i + 1], expected, f + ' inlined unchanged');
  });
  assert.ok(
    html.includes('<style>' + lf(fs.readFileSync(path.join(SRC, 'style.css'), 'utf8')) + '</style>'),
    'style.css inlined whole, nothing appended',
  );
  assert.ok(html.includes('id="world" tabindex="0"'));
  assert.ok(html.includes('id="mouseMode"'));
  assert.ok(html.includes("$('start').disabled=false"));
  assert.ok(
    html.includes('id="mouseLaw"') && html.includes('value="stick"'),
    'the mouse law choice (v12 stick as an option)',
  );
});

test('the build refuses an app.js without the automation pointer-lock shim', async () => {
  const { buildPage } = await importBuild();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-build-'));
  try {
    fs.mkdirSync(path.join(dir, 'vendor'));
    for (const f of ['index.template.html', 'style.css', 'vendor/three.min.js', ...GAME])
      fs.copyFileSync(path.join(SRC, f), path.join(dir, f));
    const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
    fs.writeFileSync(
      path.join(dir, 'app.js'),
      app.replace('navigator.webdriver===true', 'navigator.webdriver===false'),
    );
    assert.throws(() => buildPage(dir), /pointer-lock shim/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the build reads the shim in the code: a copy of its statements left in a comment or a string does not pass', async () => {
  const { buildPage, shimInCode, SHIM_MARKERS } = await importBuild();
  const app = lf(fs.readFileSync(path.join(SRC, 'app.js'), 'utf8'));
  assert.equal(shimInCode(app), true, 'the real app.js');
  // The shim disabled in the code, its statements kept in a comment and in a string.
  const start = app.indexOf('if(typeof navigator');
  assert.ok(start > 0, 'the shim block');
  const disabled =
    app.slice(0, start) +
    '/* ' +
    SHIM_MARKERS.join(' ') +
    ' */ var kept=' +
    JSON.stringify(SHIM_MARKERS.join(' ')) +
    ';\n' +
    app.slice(start).replace('navigator.webdriver===true', 'navigator.webdriver===false');
  assert.equal(shimInCode(disabled), false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-build-'));
  try {
    fs.mkdirSync(path.join(dir, 'vendor'));
    for (const f of ['index.template.html', 'style.css', 'vendor/three.min.js', ...GAME])
      fs.copyFileSync(path.join(SRC, f), path.join(dir, f));
    fs.writeFileSync(path.join(dir, 'app.js'), disabled);
    assert.throws(() => buildPage(dir), /pointer-lock shim/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the automation shim emulates the lock under WebDriver unless the real lock is asked for on purpose', () => {
  const app = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');
  const head = app.slice(0, app.indexOf('function boot()'));
  assert.match(head, /navigator\.webdriver===true&&!window\.__LB_REAL_POINTER_LOCK__/);
  assert.match(head, /Element\.prototype\.requestPointerLock=function\(\)\{locked=this;/);
  assert.match(head, /Document\.prototype\.exitPointerLock=function\(\)/);
  assert.match(head, /window\.__LB_EMULATED_POINTER_LOCK__=true/);
});

test("no network API, eval or Function constructor in the game's own scripts", () => {
  const banned =
    /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|new\s+Worker\b|\beval\s*\(|new\s+Function\s*\(|importScripts/;
  for (const f of GAME) {
    const text = fs.readFileSync(path.join(SRC, f), 'utf8');
    assert.ok(!banned.test(text), f + ' uses a banned API');
  }
  const tpl = fs.readFileSync(path.join(SRC, 'index.template.html'), 'utf8');
  assert.ok(!banned.test(tpl), 'the template uses a banned API');
  assert.ok(
    !/https?:\/\//.test(tpl.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '')),
    'no external URL in the template',
  );
});

// Code without its comments (crude: block comments, then line comments not inside a URL-like "x://").
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');

test('the test hooks are opt-in: the page reads __LB_EXPOSE__, __LB_SYNC__, __LB_MANUAL_CLOCK__ and never defines them', () => {
  for (const f of [...GAME, 'index.template.html']) {
    const text = code(fs.readFileSync(path.join(SRC, f), 'utf8'));
    assert.ok(!/__LB_(EXPOSE|SYNC|MANUAL_CLOCK|REAL_POINTER_LOCK)__\s*=(?!=)/.test(text), f + ' defines a test hook');
  }
  const app = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');
  assert.match(app, /if\(window\.__LB_EXPOSE__\)window\.__LB_EXPOSE__\(/);
  assert.match(app, /if\(window\.__LB_SYNC__\)boot\(\)/);
});
