'use strict';
// The page policy of the build (docs/SECURITE-CONCEPTION.md): the exact Content-Security-Policy string with the sha256 of each of the
// 12 inline scripts and of the stylesheet, placed right after the charset; everything else closed; verify-build
// accepts the page and refuses a tampered one; the build refuses external references, inline handlers, javascript:
// URLs, style attributes and a three.js that is not the pinned file; two builds are identical.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT, SRC } = require('../helpers/paths');

const load = (f) => import(pathToFileURL(path.join(ROOT, 'scripts', f)).href);
const b64 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('base64');
const CLOSED =
  "img-src 'none'; font-src 'none'; connect-src 'none'; media-src 'none'; worker-src 'none'; manifest-src 'none'; " +
  "frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

// A copy of src/ in a temporary folder, edited by `change`, built by `fn`.
async function withSource(change, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-csp-'));
  try {
    fs.cpSync(SRC, dir, { recursive: true });
    change(dir);
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const editFile = (dir, f, from, to) => {
  const p = path.join(dir, f);
  const text = fs.readFileSync(p, 'utf8');
  assert.ok(text.includes(from), f + ' contains ' + from);
  fs.writeFileSync(p, text.replace(from, to));
};

test('the exact policy: 12 script hashes and 1 style hash of the page blocks, in order; everything else closed', async () => {
  const { buildPage } = await load('build.mjs');
  const html = buildPage(SRC);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 12);
  assert.equal(styles.length, 1);
  const expected =
    "default-src 'none'; script-src " +
    scripts.map((s) => `'sha256-${b64(s)}'`).join(' ') +
    `; style-src 'sha256-${b64(styles[0])}'; ` +
    CLOSED;
  const tag = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${expected}">`;
  assert.ok(html.includes(tag), 'the policy follows the charset');
  assert.ok(html.indexOf(tag) < html.indexOf('<style>') && html.indexOf(tag) < html.indexOf('<script>'));
  assert.equal((html.match(/http-equiv/g) || []).length, 1);
  assert.doesNotMatch(expected, /unsafe|strict-dynamic|\*|https?:|data:|blob:/);
});

test('build() writes nothing unverified: verify-build accepts the page; csp.txt and a rebuild agree', async () => {
  const { build, buildPage, pinnedThree, SCRIPTS } = await load('build.mjs');
  const { verifyPage } = await load('verify-build.mjs');
  const { html, csp } = build(SRC);
  assert.equal(buildPage(SRC), html, 'reproducible: two builds are identical');
  const r = verifyPage(html, { threeSha256: pinnedThree(), srcDir: SRC, scripts: SCRIPTS });
  assert.deepEqual(r.problems, []);
  assert.equal(r.csp, csp);
});

test('verify-build refuses a tampered page', async () => {
  const { buildPage, pinnedThree, SCRIPTS } = await load('build.mjs');
  const { verifyPage } = await load('verify-build.mjs');
  const html = buildPage(SRC);
  const opts = { threeSha256: pinnedThree(), srcDir: SRC, scripts: SCRIPTS };
  const cases = {
    'a script byte changed': html.replace(
      'window.__LB_EMULATED_POINTER_LOCK__=true;',
      'window.__LB_EMULATED_POINTER_LOCK__=!0;',
    ),
    'a script added': html.replace('</body>', '<script>1</script></body>'),
    'the policy widened': html.replace("default-src 'none'", "default-src 'none' 'unsafe-inline'"),
    'a second policy': html.replace(
      '<meta charset="utf-8">',
      '<meta charset="utf-8"><meta http-equiv="refresh" content="0">',
    ),
    'an inline handler': html.replace('<canvas id="world"', '<canvas onclick="x()" id="world"'),
    'an external image': html.replace('</body>', '<img src="https://example.org/x.png"></body>'),
  };
  for (const [name, page] of Object.entries(cases)) {
    assert.notEqual(page, html, name + ': the case changes the page');
    assert.equal(verifyPage(page, opts).ok, false, name);
  }
});

test('the build refuses inline handlers, javascript: URLs, style attributes, external references and a changed three.js', async () => {
  const { buildPage } = await load('build.mjs');
  const T = 'index.template.html';
  const refusals = [
    [(d) => editFile(d, T, '<canvas id="world"', '<canvas onclick="go()" id="world"'), /inline event handler/],
    [
      (d) => editFile(d, T, '<footer></footer>', '<footer><a href="javascript:go()">x</a></footer>'),
      /javascript:|reference/,
    ],
    [(d) => editFile(d, T, '<footer></footer>', '<footer style="color:red"></footer>'), /style attribute/],
    [(d) => editFile(d, T, '<footer></footer>', '<footer><img src="x.png"></footer>'), /loads a resource/],
    [
      (d) => editFile(d, T, '</body>', '<script src="https://example.org/a.js"></script></body>'),
      /inline block|absolute URL/,
    ],
    [(d) => fs.appendFileSync(path.join(d, 'vendor', 'three.min.js'), '\n'), /pinned/],
  ];
  for (const [change, message] of refusals) {
    await withSource(change, (dir) => assert.throws(() => buildPage(dir), message));
  }
});

test('the page policy module holds the recorded three.js API counts and bans network and dynamic code', async () => {
  const { THREE_API_COUNTS, apiCounts } = await load('page-policy.mjs');
  assert.deepEqual(THREE_API_COUNTS, { fetch: 3 });
  const three = fs.readFileSync(path.join(SRC, 'vendor', 'three.min.js'), 'utf8');
  assert.deepEqual(apiCounts(three), THREE_API_COUNTS);
  assert.deepEqual(apiCounts('fetch(u); new Function("x"); eval("1"); new Worker(u); navigator.sendBeacon(u)'), {
    fetch: 1,
    Function: 1,
    eval: 1,
    Worker: 1,
    sendBeacon: 1,
  });
});
