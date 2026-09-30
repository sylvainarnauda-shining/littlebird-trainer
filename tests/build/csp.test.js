'use strict';
// The page policy of the build (docs/SECURITE-CONCEPTION.md): the exact Content-Security-Policy string with the sha256 of each of the
// 13 inline scripts and of the stylesheet, placed right after the charset; everything else closed; verify-build
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
const { scriptBodies, styleBodies } = require('../helpers/html');

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

test('the exact policy: 13 script hashes and 1 style hash of the page blocks, in order; everything else closed', async () => {
  const { buildPage } = await load('build.mjs');
  const html = buildPage(SRC);
  const scripts = scriptBodies(html);
  const styles = styleBodies(html);
  assert.equal(scripts.length, 13);
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
    // Blocks in the other forms HTML accepts are counted and hashed too.
    'an upper-case script added': html.replace('</body>', '<SCRIPT>1</SCRIPT></body>'),
    'a mixed-case stylesheet added': html.replace('</body>', '<StYlE>p{}</sTyLe></body>'),
    'a script whose end tag has a space': html.replace('</body>', '<script>1</script ></body>'),
    'an upper-case script before the policy': html.replace(
      '<meta charset="utf-8">',
      '<SCRIPT>1</SCRIPT><meta charset="utf-8">',
    ),
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

test('inline blocks are read in every form HTML accepts: any letter case, attributes, end tags with a space or a slash', async () => {
  const { inlineBlocks, markupProblems } = await load('page-policy.mjs');
  const page =
    '<script>a</script><SCRIPT>b</SCRIPT ><Script type="module">c</sCrIpT\n>' +
    '<script>d</scriptx>e</script/><scripts>not a block</scripts>' +
    '<style>f</style><STYLE>g</STYLE\t>';
  const want = { scripts: ['a', 'b', 'c', 'd</scriptx>e'], styles: ['f', 'g'] };
  assert.deepEqual(inlineBlocks(page), want, 'scripts/page-policy.mjs');
  assert.deepEqual({ scripts: scriptBodies(page), styles: styleBodies(page) }, want, 'tests/helpers/html.js');
  // A block with attributes, in any letter case, is refused; the build's own blocks are not.
  for (const block of ['<Script type="module">1</Script>', '<SCRIPT/>1</SCRIPT>', '<STYLE media="x">p{}</STYLE>'])
    assert.match(markupProblems(block).join('\n'), /attributes on an inline block/, block);
  assert.deepEqual(markupProblems('<script>1</script><style>p{}</style>'), []);
});

// Markup around which HTML delimits the blocks otherwise than the block expressions: each case swaps the template's
// inline script for markup that the expressions read as one script holding an image with a handler, where HTML reads
// the image as markup. The thirteen scripts are all still read, and the policy is recomputed from what the checker
// reads, as by someone who writes the whole page: only the markup check can refuse it (the hash-only policy, the
// rebuild comparison of the command line and check-asar's reference page are further guards, not exercised here).
test('verify-build refuses markup where HTML would delimit the blocks otherwise, even with the policy recomputed', async () => {
  const { buildPage, pinnedThree, SCRIPTS } = await load('build.mjs');
  const { verifyPage } = await load('verify-build.mjs');
  const { inlineBlocks, cspPolicy } = await load('page-policy.mjs');
  const html = buildPage(SRC);
  const opts = { threeSha256: pinnedThree(), srcDir: SRC, scripts: SCRIPTS };
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)[1];
  const resign = (page) => page.replace(csp, () => cspPolicy(inlineBlocks(page)));
  const inline = '<script>' + scriptBodies(html)[0] + '</script>';
  assert.ok(html.includes(inline), 'the template holds an inline script');
  assert.deepEqual(verifyPage(resign(html), opts).problems, [], 'the untouched page, its policy recomputed');
  const img = '<img src=x onerror=alert(1)>';
  const cases = {
    'a comment': [`<!-- <script> -->${img}</script> -->`, /not a tag/],
    'a <!…> declaration': [`<!x <script>${img}</script>`, /not a tag/],
    'a quote left open in a tag': [`<i title="<script>">${img}</script>">`, /quote left open/],
    'a "<" inside a tag': [`<i a <script>${img}</script>`, /quote left open or a "<" inside/],
    'a title read as text': [`<title><script></title>${img}<script></script>`, /reads as text/],
    'a noscript read as text': [`<noscript><script></noscript>${img}</script>`, /reads as text/],
    'a script in SVG': [`<svg><script>${img}</script></svg>`, /SVG or MathML/],
  };
  for (const [name, [markup, message]] of Object.entries(cases)) {
    const page = resign(html.replace(inline, () => markup));
    assert.equal(scriptBodies(page).length, 13, name + ': thirteen scripts read');
    assert.ok(
      scriptBodies(page).some((b) => b.includes(img)),
      name + ': the image is read as script',
    );
    const { ok, problems } = verifyPage(page, opts);
    assert.equal(ok, false, name);
    assert.ok(problems.length > 0 && problems.every((p) => message.test(p)), name + ': ' + problems.join('; '));
  }
});

test('the markup check refuses an end tag that closes no block and "<!--" in a script body', async () => {
  const { markupProblems } = await load('page-policy.mjs');
  assert.deepEqual(markupProblems('<!doctype html><p>1</p><script>2</script><svg><path d="M0 0"/></svg>'), []);
  assert.deepEqual(markupProblems('<script>1</script></script>'), ['an end tag that closes no inline block']);
  assert.deepEqual(markupProblems('<p>1</STYLE ></p>'), ['an end tag that closes no inline block']);
  assert.deepEqual(markupProblems('<script>a = "<!--";</script>'), ['"<!--" in an inline script']);
  assert.deepEqual(markupProblems('<p>1 < 2</p>'), ['markup that is not a tag (a comment, <!…>, <?…> or a bare "<")']);
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
