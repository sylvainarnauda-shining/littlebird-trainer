#!/usr/bin/env node
// Gate G1 (CONTRIBUTING.md): syntax-tree identity of the runtime between a git ref and the working tree, with comments and
// source positions left out. A comment scrub must leave every tree identical. A wording step compares the trees with
// the string literals masked (--mask-strings) and lists every string that changed, for review.
// The page template is compared as markup: tags and attributes must be identical; its text and its wording attributes
// (aria-label, title, placeholder, alt) are strings like the scripts' ones; its inline script is compared as a tree.
//   node scripts/ast-identity.mjs [--ref <git ref>] [--mask-strings] [--files a.js,b.js] [--json <file>]
// Exit 0 when every file is identical (under the chosen mode), 1 otherwise.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as acorn from 'acorn';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RUNTIME = [
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
export const TEMPLATE = 'index.template.html';
const WORDING_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt']);
const STRING = '\u0000string';
const lf = (s) => s.replace(/\r\n?/g, '\n');

// The tree without positions and comments; with maskStrings, every string literal and template chunk replaced by a
// marker, the original strings collected in source order.
export function canonicalTree(code, { maskStrings = false } = {}) {
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true });
  const strings = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue;
      if (node.type === 'Literal' && k === 'value' && typeof v === 'bigint') out[k] = String(v) + 'n';
      else if (node.type === 'Literal' && k === 'value' && v instanceof RegExp) out[k] = null;
      else out[k] = walk(v);
    }
    if (node.type === 'Literal' && typeof node.value === 'string') {
      strings.push(node.value);
      if (maskStrings) {
        out.value = STRING;
        delete out.raw;
      }
    }
    if (node.type === 'TemplateElement') {
      strings.push(node.value.cooked ?? node.value.raw);
      if (maskStrings) out.value = { raw: STRING, cooked: STRING };
    }
    return out;
  };
  return { tree: walk(ast), strings };
}

// First differing path of two plain trees (or null).
export function firstDifference(a, b, at = '$') {
  if (Object.is(a, b)) return null;
  if (typeof a !== typeof b || !a || !b || typeof a !== 'object') return at;
  if (Array.isArray(a) !== Array.isArray(b)) return at;
  const keys = Array.isArray(a)
    ? [...Array(Math.max(a.length, b.length)).keys()]
    : [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of keys) {
    const d = firstDifference(a[k], b[k], at + (Array.isArray(a) ? `[${k}]` : '.' + k));
    if (d) return d;
  }
  return null;
}

const changedStrings = (from, to) => {
  const out = [];
  for (let i = 0; i < Math.max(from.length, to.length); i++)
    if (from[i] !== to[i]) out.push({ from: from[i], to: to[i] });
  return out;
};

export function compareScripts(before, after, { maskStrings = false } = {}) {
  const a = canonicalTree(lf(before), { maskStrings }),
    b = canonicalTree(lf(after), { maskStrings });
  const diff = firstDifference(a.tree, b.tree);
  return { identical: !diff, firstDifference: diff, strings: diff ? [] : changedStrings(a.strings, b.strings) };
}

// Markup tokens of the template: tags with their attributes, text runs (whitespace collapsed), inline scripts as trees.
export function templateTokens(html, { maskStrings = false } = {}) {
  const tokens = [],
    strings = [];
  const re = /<script>([\s\S]*?)<\/script>|<!--[\s\S]*?-->|<(\/?)([a-zA-Z!][^\s/>]*)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(lf(html)))) {
    if (m[1] !== undefined) {
      const t = canonicalTree(m[1], { maskStrings });
      strings.push(...t.strings);
      tokens.push({ script: t.tree });
    } else if (m[3] !== undefined) {
      const attrs = [];
      for (const a of m[4].matchAll(/([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        const name = a[1].toLowerCase(),
          value = a[2] ?? a[3] ?? a[4] ?? null;
        if (WORDING_ATTRIBUTES.has(name) && value !== null) {
          strings.push(value);
          attrs.push([name, maskStrings ? STRING : value]);
        } else attrs.push([name, value]);
      }
      tokens.push({ tag: (m[2] + m[3]).toLowerCase(), attrs });
    } else if (m[5] !== undefined) {
      const text = m[5].replace(/\s+/g, ' ').trim();
      if (!text) continue;
      strings.push(text);
      tokens.push({ text: maskStrings ? STRING : text });
    }
  }
  return { tokens, strings };
}

export function compareTemplates(before, after, { maskStrings = false } = {}) {
  const a = templateTokens(before, { maskStrings }),
    b = templateTokens(after, { maskStrings });
  const diff = firstDifference(a.tokens, b.tokens);
  return { identical: !diff, firstDifference: diff, strings: diff ? [] : changedStrings(a.strings, b.strings) };
}

// The file as committed at a ref; null when the ref does not have it (a file added since).
function atRef(ref, file) {
  const r = spawnSync('git', ['show', `${ref}:src/${file}`], { cwd: ROOT, maxBuffer: 1 << 28 });
  if (r.status !== 0) {
    const exists = spawnSync('git', ['cat-file', '-e', `${ref}^{commit}`], { cwd: ROOT });
    if (exists.status === 0 && /does not exist|exists on disk, but not in/.test(String(r.stderr))) return null;
    throw Error(`git show ${ref}:src/${file} failed: ${String(r.stderr).trim()}`);
  }
  return r.stdout.toString('utf8');
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const ref = opt('--ref', 'HEAD'),
    maskStrings = argv.includes('--mask-strings');
  const files = opt('--files', [...RUNTIME, TEMPLATE].join(',')).split(',');
  const report = { ref, maskStrings, files: {} };
  let bad = 0;
  for (const f of files) {
    const before = atRef(ref, f),
      after = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
    const r =
      before === null
        ? { identical: false, firstDifference: '(file added since ' + ref + ')', strings: [] }
        : f === TEMPLATE
          ? compareTemplates(before, after, { maskStrings })
          : compareScripts(before, after, { maskStrings });
    report.files[f] = r;
    if (!r.identical) bad++;
    console.log(
      `${r.identical ? 'IDENTICAL' : 'DIFFERENT'} ${f}${r.identical ? '' : ' at ' + r.firstDifference}${maskStrings && r.identical ? ` (${r.strings.length} string(s) changed)` : ''}`,
    );
  }
  if (opt('--json')) fs.writeFileSync(path.resolve(opt('--json')), JSON.stringify(report, null, 1) + '\n');
  console.log(
    `G1 ${maskStrings ? 'with strings masked ' : ''}against ${ref}: ${bad ? bad + ' file(s) differ' : 'every tree identical'}`,
  );
  process.exit(bad ? 1 : 0);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
