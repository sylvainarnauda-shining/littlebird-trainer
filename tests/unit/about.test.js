'use strict';
// The "À propos" tab (the maintainer's request of 30/09: the version shown in the game's menu, so that whoever
// downloads or follows the project sees whether they have the latest one; no update check, the game contacts nothing):
// reachable from the menu's tabs; the product name, the full version (package.json, written by the build), the French
// line on how to compare with the releases page, that page as text and as a link opening a new tab without opener or
// referrer, the MIT licence, the unofficial-project line and the third-party notices, which ship where the tab says.
// The link's address is set by app.js and is exactly the one the Windows app's shell hands to the default browser.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT, SRC } = require('../helpers/paths');
const TEXT = require('../helpers/ui-text');

const { Document } = require(path.join(ROOT, 'tools', 'golden', 'dom.cjs'));
const policy = require(path.join(ROOT, 'desktop', 'policy.cjs'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const app = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');
const REPO = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();

// The built page (the version written in), parsed without running its scripts.
async function builtPage() {
  const { buildPage } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'build.mjs')).href);
  return new Document(buildPage(SRC), { innerWidth: 1600, innerHeight: 900 });
}

test('the menu has an À propos tab after the others, with its own page title', async () => {
  const doc = await builtPage();
  const tabs = doc.querySelectorAll('nav [data-tab]');
  assert.deepEqual(
    tabs.map((b) => b.dataset.tab),
    ['modes', 'controls', 'settings', 'about'],
  );
  assert.equal(text(tabs[3]), TEXT.aboutTab);
  const panel = doc.getElementById('about');
  assert.ok(panel && panel.classList.contains('tab') && doc.getElementById('menu').contains(panel), '#about.tab');
  assert.ok(!panel.classList.contains('active'), 'the modes tab comes first');
  assert.ok(app.includes(`about:'${TEXT.aboutTab}'`), 'selectTab titles the page À PROPOS');
});

test('the About tab: product name, full version, how to compare, the releases link, licence, notices', async () => {
  const doc = await builtPage();
  const panel = doc.getElementById('about');
  assert.equal(text(panel.querySelector('h2')), pkg.productName);
  assert.equal(text(doc.getElementById('aboutVersion')), pkg.version);
  assert.equal(text(doc.getElementById('appVersion')), 'v' + pkg.version, 'and in the menu header');
  const paragraphs = panel.querySelectorAll('p').map(text);
  assert.ok(paragraphs.includes(TEXT.aboutHowToCheck), 'the line on how to compare, word for word');
  const all = text(panel);
  for (const want of [TEXT.aboutLicence, TEXT.aboutUnofficial, TEXT.aboutNotices]) assert.match(all, want);
  // The link: empty in the markup (which may hold no address), a new tab without opener or referrer.
  const link = doc.getElementById('releasesLink');
  assert.equal(link.localName, 'a');
  assert.equal(link.getAttribute('target'), '_blank');
  assert.deepEqual(link.getAttribute('rel').split(/\s+/).sort(), ['noopener', 'noreferrer']);
  assert.equal(link.getAttribute('href'), null);
  assert.equal(text(link), '');
});

test('the notices the tab points to ship where it says: beside index.html, and in the app resources', async () => {
  const { WEB_ZIP_FILES } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'make-web-zip.mjs')).href);
  const zip = Object.fromEntries(WEB_ZIP_FILES);
  assert.equal(zip['LICENSE.txt'], 'LICENSE');
  assert.equal(zip['THIRD_PARTY_NOTICES.txt'], 'THIRD_PARTY_NOTICES.md');
  assert.ok('index.html' in zip);
  const builder = fs.readFileSync(path.join(ROOT, 'electron-builder.yml'), 'utf8');
  assert.match(builder, /- from: LICENSE\s+to: LICENSE\.txt/);
  assert.match(builder, /- from: THIRD_PARTY_NOTICES\.md\s+to: THIRD_PARTY_NOTICES\.txt/);
  for (const f of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  assert.equal(pkg.license, 'MIT');
});

test('the releases link: set by app.js to the one address the Windows shell hands to the default browser', () => {
  const m = /const RELEASES_URL='([^']+)';/.exec(app);
  assert.ok(m, 'app.js declares RELEASES_URL');
  assert.equal(m[1], policy.RELEASES_URL, 'the page and the shell agree on the address, exactly');
  assert.equal(m[1], REPO + '/releases', 'this repository');
  assert.equal(policy.externalAllowed(m[1]), true);
  assert.match(app, /\$\('releasesLink'\)\.href=RELEASES_URL;/);
  assert.match(app, /\$\('releasesLink'\)\.textContent=RELEASES_URL;/);
  // The page names no other address: this is its only absolute URL.
  assert.deepEqual(app.match(/https?:\/\/[^'"\s)]*/g), [policy.RELEASES_URL]);
});
