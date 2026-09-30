#!/usr/bin/env node
// Builds the self-contained page dist/web/index.html from src/ (zero dependencies): the template with style.css and
// the twelve scripts inlined in the template's order, every input normalised to LF, then a Content-Security-Policy
// meta tag that allows exactly the page's own inline blocks by their sha256 (13 scripts, 1 stylesheet) and nothing
// else: no network, no eval, no external resource (scripts/page-policy.mjs). The policy is also written beside the page
// (csp.txt), and scripts/verify-build.mjs checks the result before anything is written.
//   node scripts/build.mjs [--src <dir>] [--out <file>]
// Refusals: an app.js without the automation pointer-lock shim (the lock is emulated inside the page whenever
// navigator.webdriver is true, otherwise a headless test would capture the machine's real mouse); a three.js that is
// not the pinned file; any external reference, inline event handler, javascript: URL or style attribute.
// The shim's statements must be code: when the pinned development dependency acorn is installed (npm ci), they are
// looked for outside comments and string literals, so a copy left in a comment does not pass; without it (the release
// preflight builds with Node alone) the text check remains.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHARSET, cspMeta, cspPolicy, inlineBlocks, markupProblems } from './page-policy.mjs';
import { verifyPage } from './verify-build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SCRIPTS = [
  'vendor/three.min.js',
  'core/pow.js',
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
export const SHIM_MARKERS = [
  "navigator.webdriver===true&&!window.__LB_REAL_POINTER_LOCK__&&typeof Element==='function'&&typeof Document==='function'",
  'Element.prototype.requestPointerLock=function(){locked=this;changed();return Promise.resolve();};',
  'window.__LB_EMULATED_POINTER_LOCK__=true;',
];

const lf = (s) => s.replace(/\r\n?/g, '\n');
const read = (dir, f) => lf(fs.readFileSync(path.join(dir, f), 'utf8'));
const hex = (b) => crypto.createHash('sha256').update(b).digest('hex');

export function pinnedThree() {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'publish-policy.json'), 'utf8'));
  return policy.vendorChecksums['src/vendor/three.min.js'];
}

// true when every shim marker occurs as code (not wholly inside one comment or one string or template token), false
// otherwise; null when acorn is not installed.
export function shimInCode(app) {
  let acorn;
  try {
    acorn = createRequire(import.meta.url)('acorn');
  } catch {
    return null;
  }
  const inert = [];
  acorn.parse(app, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    onComment: (_block, _text, start, end) => inert.push([start, end]),
    onToken: (t) => {
      if (t.type === acorn.tokTypes.string || t.type === acorn.tokTypes.template) inert.push([t.start, t.end]);
    },
  });
  const inside = (i, n) => inert.some(([s, e]) => i >= s && i + n <= e);
  return SHIM_MARKERS.every((m) => {
    for (let i = app.indexOf(m); i >= 0; i = app.indexOf(m, i + 1)) if (!inside(i, m.length)) return true;
    return false;
  });
}

export function buildPage(srcDir = path.join(ROOT, 'src')) {
  const app = read(srcDir, 'app.js');
  const refuse = () => {
    throw Error(
      'app.js lacks the automation pointer-lock shim: refusing to build (a test page would capture the real mouse)',
    );
  };
  for (const m of SHIM_MARKERS) if (!app.includes(m)) refuse();
  if (shimInCode(app) === false) refuse();
  if (hex(fs.readFileSync(path.join(srcDir, 'vendor', 'three.min.js'))) !== pinnedThree())
    throw Error(
      'src/vendor/three.min.js is not the pinned file (publish-policy.json vendorChecksums): refusing to build',
    );
  let html = read(srcDir, 'index.template.html');
  const link = '<link rel="stylesheet" href="style.css">';
  if (!html.includes(link)) throw Error('Missing stylesheet placeholder');
  if (html.split(CHARSET).length !== 2) throw Error('The template needs exactly one ' + CHARSET);
  html = html.replace(link, () => '<style>' + read(srcDir, 'style.css') + '</style>');
  for (const file of SCRIPTS) {
    const tag = '<script src="' + file + '"></script>';
    if (!html.includes(tag)) throw Error('Missing script placeholder: ' + file);
    const code = read(srcDir, file).replace(/<\/script/gi, '<\\/script');
    html = html.replace(tag, () => '<script>\n' + code + '\n</script>');
  }
  const problems = markupProblems(html);
  if (problems.length) throw Error('Refusing to build: ' + problems.join('; '));
  return html.replace(CHARSET, () => CHARSET + cspMeta(cspPolicy(inlineBlocks(html))));
}

// The page and its policy, verified (fail closed).
export function build(srcDir = path.join(ROOT, 'src')) {
  const html = buildPage(srcDir);
  const report = verifyPage(html, { threeSha256: pinnedThree(), srcDir, scripts: SCRIPTS });
  if (!report.ok) throw Error('verify-build failed: ' + report.problems.join('; '));
  return { html, csp: report.csp };
}

function main() {
  const arg = (k, d) => {
    const i = process.argv.indexOf(k);
    return i > 0 ? path.resolve(process.argv[i + 1]) : d;
  };
  const src = arg('--src', path.join(ROOT, 'src'));
  const out = arg('--out', path.join(ROOT, 'dist', 'web', 'index.html'));
  const { html, csp } = build(src);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  fs.writeFileSync(path.join(path.dirname(out), 'csp.txt'), csp + '\n');
  console.log(
    `Built ${path.relative(ROOT, out).replace(/\\/g, '/')}: ${Buffer.byteLength(html)} bytes, sha256 ${hex(html)}. ` +
      'CSP: 13 script hashes, 1 style hash, everything else closed; no external request.',
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
