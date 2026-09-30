// The page policy shared by scripts/build.mjs and scripts/verify-build.mjs (zero dependencies): the Content-Security-
// Policy built from the page's own inline blocks, and the markup rules the page must follow for that policy to hold.
import crypto from 'node:crypto';

export const CHARSET = '<meta charset="utf-8">';
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

// The bodies of the page's inline <script> and <style> blocks, in document order.
export function inlineBlocks(html) {
  return {
    scripts: [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]),
    styles: [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]),
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
// http-equiv (the build adds the only one, the policy).
export function markupProblems(html) {
  const markup = html
    .replace(/<script>[\s\S]*?<\/script>/g, '<script></script>')
    .replace(/<style>[\s\S]*?<\/style>/g, '<style></style>');
  const problems = [];
  for (const [t] of markup.matchAll(/<[a-zA-Z][^>]*>/g)) {
    const head = t.slice(0, 60);
    if (/^<(script|style)\s/i.test(t)) problems.push('attributes on an inline block: ' + head);
    if (/^<(link|iframe|frame|object|embed|base|form|img|audio|video|source|track|portal)\b/i.test(t))
      problems.push('element that loads a resource: ' + head);
    if (/\son[a-z]+\s*=/i.test(t)) problems.push('inline event handler: ' + head);
    if (/\s(src|href|action|formaction|srcset|poster|data|background|style)\s*=/i.test(t))
      problems.push('reference or style attribute: ' + head);
    if (/\shttp-equiv\s*=/i.test(t)) problems.push('http-equiv meta: ' + head);
  }
  if (/javascript:/i.test(markup)) problems.push('javascript: URL');
  if (/https?:\/\//i.test(markup)) problems.push('absolute URL in the markup');
  return problems;
}

export function apiCounts(text) {
  const out = {};
  for (const [k, re] of Object.entries(BANNED_API)) {
    const n = (text.match(re) || []).length;
    if (n) out[k] = n;
  }
  return out;
}
