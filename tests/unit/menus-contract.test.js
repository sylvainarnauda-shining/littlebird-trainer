'use strict';
// The scripts of the menus (settings-data.js, settings.js, menus.js) start in the minimal DOM of the golden recorder
// (tools/golden/dom.cjs) for every suite that has a page. A call that DOM lacks stops the boot and breaks all those suites
// at once; a draw of Math.random shifts every draw of every session. This reads the three scripts and refuses what the
// recorder's DOM does not have, what it reads differently from a browser, and what is not reproducible: the table of
// section 3.4 of the menus plan. What a static read cannot see (event delegation: the recorder's events do not bubble)
// is left to the page tests that dispatch events (tests/integration/app-menus-*.test.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const { SRC } = require('../helpers/paths');

const { tokenizer, tokTypes } = acorn;
const FILES = ['settings-data.js', 'settings.js', 'menus.js'];
// Members the recorder's DOM lacks or reads differently (insertAdjacent*, after and before are absent; setProperty and
// cssText do not write the style object; valueAsNumber is not modelled), and the markup writers the page policy forbids.
const MEMBERS = new Set([
  'createElementNS',
  'createDocumentFragment',
  'cloneNode',
  'insertAdjacentHTML',
  'insertAdjacentElement',
  'insertAdjacentText',
  'after',
  'before',
  'setProperty',
  'cssText',
  'valueAsNumber',
  'innerHTML',
  'outerHTML',
]);
// Names that never fire in the recorder (frames and observers) or break reproducibility (the clock).
const NAMES = new Set(['Date', 'performance', 'requestAnimationFrame', 'IntersectionObserver', 'ResizeObserver']);
const SELECTOR_CALLS = new Set(['querySelector', 'querySelectorAll', 'closest', 'matches']);
// A pseudo-class or an attribute operator (^= $= *= |=): the recorder reads them as something else.
const SELECTOR_FORM = /:[a-z-]+|[\^$*|]=/;

// What the source holds that the contract refuses, as readable strings.
function violations(source) {
  const tokens = [...tokenizer(source, { ecmaVersion: 'latest' })];
  const out = [];
  tokens.forEach((t, i) => {
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    const member = prev && prev.type === tokTypes.dot;
    if (t.type === tokTypes.name && member && MEMBERS.has(t.value)) out.push('.' + t.value);
    if (t.type === tokTypes.name && !member && NAMES.has(t.value)) out.push(t.value);
    if (t.value === 'Math' && next?.type === tokTypes.dot && tokens[i + 2]?.value === 'random') out.push('Math.random');
    if (t.value === 'classList' && next?.type === tokTypes.dot && tokens[i + 2]?.value === 'replace')
      out.push('classList.replace');
    // dataset.x = ...: a write the recorder does not reflect into the data-x attribute
    if (t.value === 'dataset' && next?.type === tokTypes.dot && tokens[i + 3]?.type === tokTypes.eq)
      out.push('write to dataset.' + tokens[i + 2].value);
    const quoted = tokens[i + 2];
    if (SELECTOR_CALLS.has(t.value) && next?.type === tokTypes.parenL && quoted?.type === tokTypes.string)
      if (SELECTOR_FORM.test(quoted.value)) out.push(`${t.value}(${JSON.stringify(quoted.value)})`);
  });
  return out;
}

test('the three scripts of the menus use only what the recorder DOM has and nothing irreproducible', () => {
  for (const file of FILES) assert.deepEqual(violations(fs.readFileSync(path.join(SRC, file), 'utf8')), [], file);
});

test('the check sees each refused form', () => {
  const bad = `
    document.createElementNS(ns, 'svg'); el.cloneNode(true); el.innerHTML = x; el.insertAdjacentHTML('beforeend', x);
    el.after(b); el.style.setProperty('--a', 1); input.valueAsNumber; classList.replace('a', 'b');
    el.dataset.mode = 'x'; const t = Date.now() + performance.now() + Math.random(); requestAnimationFrame(f);
    new ResizeObserver(f); doc.querySelectorAll('button:not([disabled])'); doc.querySelector('[href^="#"]');
  `;
  assert.deepEqual(violations(bad), [
    '.createElementNS',
    '.cloneNode',
    '.innerHTML',
    '.insertAdjacentHTML',
    '.after',
    '.setProperty',
    '.valueAsNumber',
    'classList.replace',
    'write to dataset.mode',
    'Date',
    'performance',
    'Math.random',
    'requestAnimationFrame',
    'ResizeObserver',
    'querySelectorAll("button:not([disabled])")',
    'querySelector("[href^=\\"#\\"]")',
  ]);
});

test('what the contract allows is not refused', () => {
  const fine = `
    const $ = (id) => doc.getElementById(id); el.append(a, b); el.setAttribute('role', 'tab'); el.classList.toggle('on', 1);
    doc.querySelectorAll('.opt[data-for]'); doc.querySelectorAll('input[id],select[id]'); el.closest('label');
    const mode = b.dataset.mode; el.hidden = true; el.addEventListener('input', f); Math.floor(x);
  `;
  assert.deepEqual(violations(fine), []);
});
