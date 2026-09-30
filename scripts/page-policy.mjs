// The page policy shared by scripts/build.mjs and scripts/verify-build.mjs (zero dependencies): the Content-Security-
// Policy built from the page's own inline blocks, and the markup rules the page must follow for that policy to hold.
import crypto from 'node:crypto';

export const CHARSET = '<meta charset="utf-8">';
// The version the page shows (menu header and "À propos" tab) is package.json's, its single source of truth: the
// template holds this placeholder where the version goes, and the build writes the version there (scripts/build.mjs).
// Only a plain release version (X.Y.Z, with an optional pre-release tag such as 1.0.0-rc.1) is accepted, so that
// nothing but digits, letters, dots and hyphens can reach the markup.
export const VERSION_TOKEN = '{{version}}';
export const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;
// Everything the page does not need is closed; the inline blocks are allowed by hash only (no 'unsafe-inline').
export const CSP_CLOSED = [
  "img-src 'none'",
  "font-src 'none'",
  "connect-src 'none'",
  "media-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
];
// Network and dynamic-code APIs: none in the page's own scripts; in the vendored three.js exactly the recorded counts
// (measured on the pinned r160 build: three fetch( matches in its unused file loaders, nothing else).
export const BANNED_API = {
  fetch: /\bfetch\s*\(/g,
  XMLHttpRequest: /XMLHttpRequest/g,
  WebSocket: /WebSocket/g,
  EventSource: /EventSource/g,
  sendBeacon: /sendBeacon/g,
  Worker: /new\s+Worker\b/g,
  eval: /\beval\s*\(/g,
  Function: /new\s+Function\s*\(/g,
  importScripts: /importScripts/g,
};
export const THREE_API_COUNTS = { fetch: 3 };

export const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('base64');

// A <script> or <style> element: the start tag in any letter case, with or without attributes (markupProblems refuses a
// block with attributes), then the body up to the first end tag, which HTML recognises as "</script" or "</style" in
// any letter case followed by whitespace, "/" or ">", closed at the next ">". A block written in any other form than
// the build's <script>…</script> is therefore counted, hashed and checked, never skipped (the build escapes "</script"
// inside the scripts it inlines). These expressions are not an HTML parser: markupProblems refuses the markup around
// which HTML would delimit the blocks otherwise (a comment, a quote left open in a tag, an element read as text…).
const SCRIPT_BLOCK = /<script(?=[\t\n\f\r />])[^>]*>([\s\S]*?)<\/script(?=[\t\n\f\r />])[^>]*>/gi;
const STYLE_BLOCK = /<style(?=[\t\n\f\r />])[^>]*>([\s\S]*?)<\/style(?=[\t\n\f\r />])[^>]*>/gi;
// The start tag of a block, its body left out (for the markup checks).
const startTagOnly = (block, name) => block.slice(0, block.indexOf('>') + 1) + '</' + name + '>';
// Elements whose content HTML reads as text up to their own end tag: a "<script>" there is text, not a block.
const TEXT_ELEMENT =
  /<(title|textarea|xmp|iframe|noembed|noframes|noscript|plaintext)(?=[\t\n\f\r />])[^>]*>(?![^<]*<\/\1(?=[\t\n\f\r />]))/i;
// Whether a block starts inside SVG or MathML, where HTML does not read <script> and <style> bodies as above.
function blockInForeignContent(markup) {
  let depth = 0;
  for (const [tag, end, name] of markup.matchAll(/<(\/?)(svg|math|script|style)(?=[\t\n\f\r />])[^>]*>/gi)) {
    if (/^(svg|math)$/i.test(name)) depth = end ? Math.max(0, depth - 1) : tag.endsWith('/>') ? depth : depth + 1;
    else if (!end && depth > 0) return true;
  }
  return false;
}

// The bodies of the page's inline <script> and <style> blocks, in document order.
export function inlineBlocks(html) {
  return {
    scripts: [...html.matchAll(SCRIPT_BLOCK)].map((m) => m[1]),
    styles: [...html.matchAll(STYLE_BLOCK)].map((m) => m[1]),
  };
}

export function cspPolicy({ scripts, styles }) {
  const src = (bodies) => bodies.map((b) => `'sha256-${sha256(b)}'`).join(' ');
  return [`default-src 'none'`, `script-src ${src(scripts)}`, `style-src ${src(styles)}`, ...CSP_CLOSED].join('; ');
}

export function cspMeta(policy) {
  return `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
}

// The markup outside the inline blocks: no external reference, inline handler, javascript: URL, style attribute or
// http-equiv (the build adds the only one, the policy). And nothing around which HTML would delimit the blocks
// otherwise than SCRIPT_BLOCK and STYLE_BLOCK do, so that the blocks checked and hashed are the ones the page has: no
// "<" that does not open a tag (a comment, <!…> other than the leading doctype, <?…>), no tag with a quote left open or
// a "<" inside, no markup inside an element read as text, no block in SVG or MathML, no end tag that closes no block,
// and no "<!--" in a script body (HTML would then look for its end further on).
export function markupProblems(html) {
  const markup = html
    .replace(SCRIPT_BLOCK, (block) => startTagOnly(block, 'script'))
    .replace(STYLE_BLOCK, (block) => startTagOnly(block, 'style'));
  const problems = [];
  if (/<(?![a-zA-Z]|\/[a-zA-Z])/.test(markup.replace(/^<!doctype html>/i, '')))
    problems.push('markup that is not a tag (a comment, <!…>, <?…> or a bare "<")');
  if (TEXT_ELEMENT.test(markup)) problems.push('markup inside an element HTML reads as text');
  if (blockInForeignContent(markup)) problems.push('an inline block inside SVG or MathML');
  // Empty block pairs are removed until none is left (one pass could rebuild a pair from pieces around another), then
  // any end tag left closes no block.
  let unpaired = markup;
  for (let previous = ''; unpaired !== previous;) {
    previous = unpaired;
    unpaired = unpaired.replace(/<(script|style)(?=[\t\n\f\r />])[^>]*><\/\1>/gi, '');
  }
  if (/<\/(script|style)(?=[\t\n\f\r />])/i.test(unpaired)) problems.push('an end tag that closes no inline block');
  if ([...html.matchAll(SCRIPT_BLOCK)].some((m) => m[1].includes('<!--'))) problems.push('"<!--" in an inline script');
  for (const [t] of markup.matchAll(/<[a-zA-Z][^>]*>/g)) {
    const head = t.slice(0, 60);
    const inner = t.slice(1);
    if (inner.includes('<') || /["']/.test(inner.replace(/"[^"]*"|'[^']*'/g, '')))
      problems.push('a tag with a quote left open or a "<" inside: ' + head);
    if (/^<(script|style)[\s/]/i.test(t)) problems.push('attributes on an inline block: ' + head);
    if (/^<(link|iframe|frame|object|embed|base|form|img|audio|video|source|track|portal)\b/i.test(t))
      problems.push('element that loads a resource: ' + head);
    if (/\son[a-z]+\s*=/i.test(t)) problems.push('inline event handler: ' + head);
    if (/\s(src|href|action|formaction|srcset|poster|data|background|style)\s*=/i.test(t))
      problems.push('reference or style attribute: ' + head);
    if (/\shttp-equiv\s*=/i.test(t)) problems.push('http-equiv meta: ' + head);
  }
  if (/javascript:/i.test(markup)) problems.push('javascript: URL');
  if (/https?:\/\//i.test(markup)) problems.push('absolute URL in the markup');
  if (markup.includes(VERSION_TOKEN)) problems.push('version placeholder left in the markup');
  return problems;
}

// The versions a built page shows: in the menu header (#appVersion, "v" and the version) and in the "À propos" tab
// (#aboutVersion); null where the element is missing or not in that form.
export function shownVersions(html) {
  const menu = /\bid="appVersion"[^>]*>v([^<]*)</.exec(html);
  const about = /\bid="aboutVersion"[^>]*>([^<]*)</.exec(html);
  return { menu: menu ? menu[1] : null, about: about ? about[1] : null };
}

export function apiCounts(text) {
  const out = {};
  for (const [k, re] of Object.entries(BANNED_API)) {
    const n = (text.match(re) || []).length;
    if (n) out[k] = n;
  }
  return out;
}
