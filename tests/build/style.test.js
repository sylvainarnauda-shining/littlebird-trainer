'use strict';
// The interface's own visual identity: every colour, radius and font of src/style.css comes from the tokens
// declared once on :root; no corner brackets; system fonts only; the only stylesheet of the page.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SRC } = require('../helpers/paths');

const css = fs.readFileSync(path.join(SRC, 'style.css'), 'utf8');
const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
const root = /:root\{([^}]*)\}/.exec(noComments);
const outside = noComments.replace(/:root\{[^}]*\}/, '');
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/g;

test('the tokens are declared once, on :root', () => {
  assert.ok(root, ':root block');
  assert.equal((noComments.match(/:root\{/g) || []).length, 1);
  const tokens = new Set([...root[1].matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1]));
  for (const t of [
    'ink',
    'muted',
    'line',
    'surface',
    'accent',
    'accent-ink',
    'danger',
    'ok',
    'radius',
    'radius-sm',
    'font',
  ])
    assert.ok(tokens.has(t), '--' + t + ' declared');
  const used = new Set([...outside.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((m) => m[1]));
  for (const u of used) assert.ok(tokens.has(u), '--' + u + ' used but not declared');
});

test('no literal colour outside the tokens', () => {
  // Declarations only (the innermost braces): '#feed' in a selector is an id, not a colour.
  const declarations = [...outside.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).join(';');
  assert.deepEqual(declarations.match(COLOUR) || [], []);
  assert.ok((root[1].match(COLOUR) || []).length > 20, 'the colours live in the tokens');
});

test('rounded corners from the radius tokens; no corner brackets', () => {
  const radii = [...outside.matchAll(/border-radius:([^;}]+)/g)].map((m) => m[1]);
  assert.ok(radii.length > 10, 'panels and controls are rounded');
  for (const r of radii) assert.match(r.trim(), /^var\(--radius(-sm)?\)/, 'radius from a token: ' + r);
  assert.ok(!/:(?:before|after)\{content:''/.test(outside), 'no pseudo-element brackets');
});

test('system fonts only, no web font and no external resource', () => {
  assert.ok(!/@font-face|@import|url\(/.test(noComments));
  assert.match(root[1], /--font:system-ui,/);
});
