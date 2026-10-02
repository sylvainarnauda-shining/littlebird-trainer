'use strict';
// The mode choice and the handlers that the page's controls share (src/menus.js), on the page of the golden recorder: the
// real template, the real order of the handlers, events that run them. The ui and sessions goldens record the same steps
// (the mode cards, the range type, every option of a mode); here each step is pinned on its own, with the texts, the
// toast, the saved profile and the order of two handlers on one control.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openPage } = require('../helpers/page');
const { load } = require('../helpers/runtime');

const { MODES } = load('menus.js');
const { BOUNDS } = load('settings.js');
const STORE = 'littlebird-range-v1';
const cards = (page) => page.document.querySelectorAll('[data-mode]');
const segments = (page) => page.document.querySelectorAll('[data-scenario]');
const card = (page, mode) => cards(page).find((c) => c.dataset.mode === mode);
const segment = (page, scenario) => segments(page).find((c) => c.dataset.scenario === scenario);
const active = (list, key) => list.filter((c) => c.classList.contains('active')).map((c) => c.dataset[key]);
const activeModes = (page) => active(cards(page), 'mode');
const activeSegments = (page) => active(segments(page), 'scenario');
const options = (page) => page.document.querySelectorAll('.opt[data-for]');
const shownOptions = (page) =>
  options(page)
    .filter((e) => !e.hidden)
    .map((e) => e.dataset.for.split(' '));

test('MODES describes exactly the mode cards of the page, each with its four texts', async () => {
  const page = await openPage();
  assert.deepEqual(
    cards(page)
      .map((c) => c.dataset.mode)
      .sort(),
    Object.keys(MODES).sort(),
  );
  for (const [mode, info] of Object.entries(MODES))
    for (const key of ['title', 'crumb', 'text', 'start'])
      assert.ok(typeof info[key] === 'string' && info[key].trim() !== '', `${mode}.${key}`);
});

test('the page boots on the stand de tir: its card, its text, its options', async () => {
  const page = await openPage();
  assert.deepEqual(activeModes(page), ['range']);
  assert.equal(page.el('modeTitle').textContent, MODES.range.title);
  assert.equal(page.el('modeLabel').textContent, MODES.range.title);
  assert.ok(shownOptions(page).length > 0 && shownOptions(page).every((modes) => modes.includes('range')));
});

test('a mode card selects its mode: card, texts, options, scenario', async () => {
  const page = await openPage();
  for (const mode of Object.keys(MODES)) {
    await page.click(card(page, mode));
    assert.deepEqual(activeModes(page), [mode], mode);
    assert.equal(page.el('modeTitle').textContent, MODES[mode].title, mode);
    assert.equal(page.el('modeCrumb').textContent, MODES[mode].crumb, mode);
    assert.equal(page.el('modeText').textContent, MODES[mode].text, mode);
    assert.equal(page.app.cfg.scenario, mode === 'range' ? page.app.cfg.rangeType : mode, mode);
    assert.ok(
      shownOptions(page).every((modes) => modes.includes(mode)),
      mode + ': only its options',
    );
    assert.ok(
      options(page).some((e) => e.hidden),
      mode + ': the others are hidden',
    );
  }
  assert.equal(JSON.parse(page.storage.get(STORE)).settings.scenario, 'free', 'the last choice is saved');
});

test('the range type: its button, the scenario, and the type kept while another mode is visited', async () => {
  const page = await openPage();
  await page.click(segment(page, 'ground'));
  assert.deepEqual([page.app.cfg.rangeType, page.app.cfg.scenario], ['ground', 'ground']);
  assert.deepEqual(activeModes(page), ['range']);
  assert.deepEqual(activeSegments(page), ['ground']);
  await page.click(card(page, 'assault'));
  assert.deepEqual([page.app.cfg.rangeType, page.app.cfg.scenario], ['ground', 'assault']);
  assert.deepEqual(activeSegments(page), [], 'no range type outside the stand de tir');
  await page.click(card(page, 'range'));
  assert.equal(page.app.cfg.scenario, 'ground');
  assert.deepEqual(activeSegments(page), ['ground']);
});

test('a disabled mode card does nothing', async () => {
  const page = await openPage();
  const duel = card(page, 'duel');
  duel.disabled = true;
  duel.onclick(); // a browser does not click a disabled button; the handler also refuses
  assert.deepEqual(activeModes(page), ['range']);
  assert.equal(page.app.cfg.scenario, 'air');
});

test('a control with a setting: stored as its type, validated, shown back, saved', async () => {
  const page = await openPage();
  await page.setInput('pitchSens', '9999');
  assert.equal(page.app.cfg.pitchSens, BOUNDS.pitchSens[1], 'a number, held to the bound of the table');
  await page.setInput('invertY', true);
  assert.equal(page.app.cfg.invertY, true);
  await page.setInput('difficulty', 'real');
  assert.equal(page.app.cfg.difficulty, 'real');
  const saved = JSON.parse(page.storage.get(STORE)).settings;
  assert.deepEqual([saved.pitchSens, saved.invertY, saved.difficulty], [BOUNDS.pitchSens[1], true, 'real']);
  assert.equal(page.el('pitchSens').value, String(BOUNDS.pitchSens[1]), 'the control shows the validated value');
});

test('changing the exercise hides RESUME, changing a display option does not', async () => {
  const page = await openPage();
  const changes = [
    ['a display option', () => page.setInput('showMinimap', false), false],
    ['an option of the exercise', () => page.setInput('trajectory', 'circle'), true],
    ['a mode card', () => page.click(card(page, 'free')), true],
    ['a range type', () => page.click(segment(page, 'mixed')), true],
  ];
  for (const [what, change, hidden] of changes) {
    await page.click('start');
    assert.equal(page.el('resume').hidden, false, what + ': a session is running');
    await change();
    assert.equal(page.el('resume').hidden, hidden, what);
    page.app.pause();
  }
});

test('the graphics quality says it waits for the next load; the mouse law starts the input afresh', async () => {
  const page = await openPage();
  await page.setInput('graphics', 'low');
  assert.match(page.toast(), /prochain chargement/);
  Object.assign(page.app.mouse, {
    mousePitch: 0.4,
    mouseYaw: -0.2,
    ratePitch: 1,
    rateYaw: 2,
    accX: 3,
    accY: 4,
    accT: 5,
  });
  await page.setInput('mouseLaw', 'stick');
  assert.match(page.toast(), /manche virtuel/);
  assert.deepEqual(
    { ...page.app.mouse },
    { mousePitch: 0, mouseYaw: 0, accX: 0, accY: 0, accT: 0, ratePitch: 0, rateYaw: 0 },
  );
  await page.setInput('mouseLaw', 'rate');
  assert.match(page.toast(), /loi mesurée/);
});

test('the handler of a setting runs before the light preset handler on the same control', async () => {
  const page = await openPage();
  await page.setInput('lighting', 'soir-clair');
  assert.equal(page.app.lightName, 'soir-clair');
  await page.setInput('lighting', 'aube-clair');
  assert.equal(page.app.lightName, 'aube-clair', 'the preset follows the setting just stored, not the one before');
  assert.equal(page.app.cfg.lighting, 'aube-clair');
});
