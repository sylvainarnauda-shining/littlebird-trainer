'use strict';
// The version the game shows (the menu header and the "À propos" tab) is package.json's, written into the page by the
// build (scripts/build.mjs): no source file holds a copy of it, so a release shows exactly the version it is tagged
// with. The build refuses a template without the placeholder and a version that is not X.Y.Z (optional pre-release
// tag); verify-build refuses a page that shows another version, or keeps the placeholder. The scripts, and so the
// page's Content-Security-Policy, do not depend on the version.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT, SRC } = require('../helpers/paths');
const { scriptBodies: scriptsOf } = require('../helpers/html');

const load = (f) => import(pathToFileURL(path.join(ROOT, 'scripts', f)).href);
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const cspOf = (html) => /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)[1];

test("the built page shows package.json's full version in the menu header and the À propos tab", async () => {
  const { buildPage, packageVersion } = await load('build.mjs');
  const { VERSION_TOKEN, VERSION_PATTERN, shownVersions } = await load('page-policy.mjs');
  assert.match(pkg.version, VERSION_PATTERN);
  assert.equal(packageVersion(), pkg.version);
  const html = buildPage(SRC);
  assert.deepEqual(shownVersions(html), { menu: pkg.version, about: pkg.version });
  assert.ok(html.includes('id="appVersion">v' + pkg.version + '</span>'), 'the menu badge reads v' + pkg.version);
  assert.ok(!html.includes(VERSION_TOKEN), 'no placeholder left');
});

test('the version is injected, not copied: another one changes the markup only, no script, no policy', async () => {
  const { buildPage } = await load('build.mjs');
  const { shownVersions } = await load('page-policy.mjs');
  const mine = buildPage(SRC);
  for (const version of ['1.2.3', '1.0.0-rc.1', '10.20.30']) {
    const other = buildPage(SRC, { version });
    assert.deepEqual(shownVersions(other), { menu: version, about: version }, version);
    assert.deepEqual(scriptsOf(other), scriptsOf(mine), version + ': the scripts are the same');
    assert.equal(cspOf(other), cspOf(mine), version + ': the policy is the same');
  }
});

test('no source file holds a copy of the version: the template has placeholders, package.json the value', async () => {
  const { VERSION_TOKEN } = await load('page-policy.mjs');
  const template = fs.readFileSync(path.join(SRC, 'index.template.html'), 'utf8');
  assert.equal(template.split(VERSION_TOKEN).length - 1, 2, 'two placeholders: menu header and À propos');
  assert.match(template, /id="appVersion">v\{\{version\}\}</);
  assert.match(template, /id="aboutVersion">\{\{version\}\}</);
  for (const f of ['index.template.html', 'app.js', 'style.css']) {
    const text = fs.readFileSync(path.join(SRC, f), 'utf8');
    assert.ok(!text.includes(pkg.version), f + ' holds the version ' + pkg.version);
    // A hand-written version such as the former menu badge "v0.9" (the model names v6, v12, v13 have no dot).
    assert.doesNotMatch(text, /\bv\d+\.\d+/, f + ' holds a version number');
  }
});

test('the build refuses a template without the version and a version that is not X.Y.Z', async () => {
  const { buildPage, packageVersion } = await load('build.mjs');
  for (const bad of [
    '0.9',
    '0.9.0.1',
    'v0.9.0',
    '01.0.0',
    '0.9.0<b>',
    '0.9.0 ',
    '1.0.0+build.5',
    '1.0.0-',
    '',
    null,
    9,
  ])
    assert.throws(() => buildPage(SRC, { version: bad }), /is not X\.Y\.Z/, JSON.stringify(bad));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-version-'));
  try {
    fs.cpSync(SRC, path.join(dir, 'src'), { recursive: true });
    const t = path.join(dir, 'src', 'index.template.html');
    fs.writeFileSync(t, fs.readFileSync(t, 'utf8').replaceAll('{{version}}', '0.9'));
    assert.throws(() => buildPage(path.join(dir, 'src')), /shows no version/);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '0.9.0"><script>' }));
    assert.throws(() => packageVersion(dir), /is not X\.Y\.Z/);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '2.0.0' }));
    assert.equal(packageVersion(dir), '2.0.0');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verify-build refuses a page that shows another version or keeps the placeholder', async () => {
  const { buildPage, pinnedThree, SCRIPTS } = await load('build.mjs');
  const { verifyPage } = await load('verify-build.mjs');
  const html = buildPage(SRC);
  const opts = { threeSha256: pinnedThree(), srcDir: SRC, scripts: SCRIPTS, version: pkg.version };
  assert.deepEqual(verifyPage(html, opts).problems, []);
  const r = verifyPage(html, { ...opts, version: '9.9.9' });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /shows version .* expected 9\.9\.9/);
  const cases = {
    'the placeholder in the menu': html.replace('>v' + pkg.version + '<', '>v{{version}}<'),
    'another version in À propos': html.replace('id="aboutVersion">' + pkg.version, 'id="aboutVersion">0.0.1'),
    'no version in the menu': html.replace(' id="appVersion"', ''),
  };
  for (const [name, page] of Object.entries(cases)) {
    assert.notEqual(page, html, name + ': the case changes the page');
    assert.equal(verifyPage(page, opts).ok, false, name);
  }
});
