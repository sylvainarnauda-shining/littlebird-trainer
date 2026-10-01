'use strict';
// The goldens prove something only if their scripts exercise the game (no vacuous goldens): the static
// exercise checks of the recorder's gate (tools/golden/gate.cjs step 4) on the installed fixtures, plus the integrity of
// the fixture folders (every file listed with its sha256) and the provenance of the recorder.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { FIXTURES, GOLDEN, RECORDER, SRC, TEMPLATE } = require('../helpers/paths');
const { MENUS_SCRIPTS: MENUS, scriptTag, templateScriptFiles, templateWithMenus } = require('../helpers/html');

const J = (f) => JSON.parse(fs.readFileSync(path.join(GOLDEN, f), 'utf8'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

test('golden folder: every file listed in MANIFEST.json with its sha256, nothing else', () => {
  const m = J('MANIFEST.json');
  const listed = m.files.map((f) => f.file).sort();
  const present = fs
    .readdirSync(GOLDEN)
    .filter((f) => f !== 'MANIFEST.json')
    .sort();
  assert.deepEqual(present, listed);
  for (const f of m.files) {
    const b = fs.readFileSync(path.join(GOLDEN, f.file));
    assert.equal(b.length, f.bytes, f.file);
    assert.equal(sha(b), f.sha256, f.file);
  }
  const suites = [
    'audio',
    'flight',
    'hookapi',
    'hud',
    'joystick',
    'models',
    'modules',
    'parity',
    'sessions',
    'settings',
    'ui',
    'world',
  ];
  assert.deepEqual(listed, [...suites.map((s) => s + '.json'), 'meta.json'].sort());
});

test('recording-derived inputs: every file of tests/fixtures/MANIFEST.json matches its sha256', () => {
  const m = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'MANIFEST.json'), 'utf8'));
  assert.ok(m.files.length >= 7);
  for (const f of m.files) assert.equal(sha(fs.readFileSync(path.join(FIXTURES, f.file))), f.sha256, f.file);
  // The goldens name the inputs they were recorded with.
  assert.deepEqual(
    J('meta.json').inputs,
    m.files.map((f) => ({ file: f.file, sha256: f.sha256 })),
  );
});

test('recorder provenance: tools/golden is the recorder named by the goldens', () => {
  const { recorderManifest } = require(path.join(RECORDER, 'provenance.cjs'));
  const now = recorderManifest(RECORDER);
  const golden = J('meta.json').recorderManifest;
  assert.deepEqual(Object.keys(now).sort(), Object.keys(golden).sort());
  for (const k of Object.keys(golden)) assert.equal(now[k].sha256_lf, golden[k].sha256_lf, k);
});

test('recorder: the template scripts are found as HTML finds them; a form the build does not write stops it', () => {
  const { loadRuntime } = require(path.join(RECORDER, 'harness.cjs'));
  assert.equal(loadRuntime({ src: SRC, template: TEMPLATE }).scripts.inline.length, 1, 'the inline error handler');
  const template = fs.readFileSync(TEMPLATE, 'utf8');
  const app = '<script src="app.js"></script>';
  const variants = {
    'an upper-case inline script': template.replace('<script>', '<SCRIPT>'),
    'an inline script with an attribute': template.replace('<script>', '<script type="module">'),
    'an upper-case external script': template.replace(app, '<SCRIPT src="app.js"></SCRIPT>'),
    'an end tag with a space': template.replace(app, '<script src="app.js"></script >'),
    'an external script with another attribute': template.replace(app, '<script src="app.js" defer></script>'),
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-harness-'));
  try {
    for (const [name, text] of Object.entries(variants)) {
      assert.notEqual(text, template, name + ': the variant changes the template');
      const file = path.join(dir, 'index.template.html');
      fs.writeFileSync(file, text);
      assert.throws(() => loadRuntime({ src: SRC, template: file }), /in a form the recorder does not read/, name);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The files the recorder reads are the ones the template names, in its order: a runtime without the menus' scripts (the
// one the goldens name) and one with them are both read, so that adding them breaks no recording. These tests start from
// the template without the menus' scripts, whichever of them the real one names by now. The folder holds the real
// three.js and core/pow.js (the recorder checks their revision and their API) and a stub for every other script, the
// game's own included, that only records that it ran: what these tests pin is the loading, so no change to a script
// of the game can break them (app.js will need the menus' globals, the stub does not).
const BASE = templateWithMenus(fs.readFileSync(TEMPLATE, 'utf8'));
const NAMED = templateScriptFiles(BASE);
const GAME = NAMED.slice(2); // after three.js and core/pow.js: the nine modules, then app.js
const withMenus = (files) => templateWithMenus(fs.readFileSync(TEMPLATE, 'utf8'), files);
// What a stub runs: it notes its name; app.js, the one script that hands the page to the harness, does that too.
const stub = (f) =>
  `(window.__ran = window.__ran || []).push('${f}');` + (f === 'app.js' ? 'window.__LB_EXPOSE__({});' : '');

let runtimeDir;
let templates = 0;
before(() => {
  runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-runtime-'));
  for (const f of NAMED.slice(0, 2)) {
    fs.mkdirSync(path.dirname(path.join(runtimeDir, f)), { recursive: true });
    fs.copyFileSync(path.join(SRC, f), path.join(runtimeDir, f));
  }
  for (const f of [...GAME, ...MENUS]) fs.writeFileSync(path.join(runtimeDir, f), stub(f));
});
after(() => fs.rmSync(runtimeDir, { recursive: true, force: true }));
const templateFile = (html) => {
  const file = path.join(runtimeDir, `template-${templates++}.html`);
  fs.writeFileSync(file, html);
  return file;
};

test("recorder: it reads the files the template names, the menus' scripts only when it names them", () => {
  const { loadRuntime, makeModuleRealm } = require(path.join(RECORDER, 'harness.cjs'));
  const modules = GAME.slice(0, -1);
  // The folder holds the menus' scripts and the template does not name them: they are not read.
  const plain = loadRuntime({ src: runtimeDir, template: templateFile(BASE) });
  assert.deepEqual(Object.keys(plain.manifest), [...NAMED, 'index.template.html']);
  assert.deepEqual(Object.keys(plain.scripts.game), [...modules, 'app.js']);
  assert.throws(() => makeModuleRealm(plain, { files: ['settings.js'] }), /does not load settings\.js/);
  // Named, they are read, hashed with the others and kept in the template's order.
  const menus = loadRuntime({ src: runtimeDir, template: templateFile(withMenus(MENUS)) });
  assert.deepEqual(Object.keys(menus.manifest), [...NAMED.slice(0, -1), ...MENUS, 'app.js', 'index.template.html']);
  assert.deepEqual(Object.keys(menus.scripts.game), [...modules, ...MENUS, 'app.js']);
  assert.deepEqual(Array.from(makeModuleRealm(menus, { files: ['settings.js'] }).g.__ran), ['settings.js']);
  // Each one is optional on its own.
  const one = loadRuntime({ src: runtimeDir, template: templateFile(withMenus(['settings.js'])) });
  assert.deepEqual(Object.keys(one.scripts.game), [...modules, 'settings.js', 'app.js']);
});

test('recorder: the template must hold three.js, the core scripts and the game scripts in order, nothing else', () => {
  const { loadRuntime } = require(path.join(RECORDER, 'harness.cjs'));
  const app = scriptTag('app.js');
  const variants = {
    "a menus' script before the one it follows": withMenus(['settings-data.js', 'menus.js', 'settings.js']),
    "a menus' script after app.js": BASE.replace(app, app + scriptTag('menus.js')),
    "a menus' script twice": withMenus([...MENUS, 'menus.js']),
    'a script the recorder does not know': withMenus(['extra.js']),
    'a game script missing': BASE.replace(scriptTag('bot.js'), ''),
    'two scripts swapped': BASE.replace(
      scriptTag('world.js') + scriptTag('physics.js'),
      scriptTag('physics.js') + scriptTag('world.js'),
    ),
    'the core script after the modules': BASE.replace(scriptTag('core/pow.js'), '').replace(
      scriptTag('world.js'),
      scriptTag('world.js') + scriptTag('core/pow.js'),
    ),
    'app.js first': BASE.replace(app, '').replace(
      scriptTag('vendor/three.min.js'),
      app + scriptTag('vendor/three.min.js'),
    ),
  };
  for (const [name, text] of Object.entries(variants)) {
    assert.notEqual(text, BASE, name + ': the variant changes the template');
    assert.throws(() => loadRuntime({ src: runtimeDir, template: templateFile(text) }), /script tags are not/, name);
  }
});

test("recorder: a page boots with the menus' scripts, every script running in the template's order", async () => {
  const { loadRuntime, createPage } = require(path.join(RECORDER, 'harness.cjs'));
  const rt = loadRuntime({ src: runtimeDir, template: templateFile(withMenus(MENUS)) });
  const page = await createPage(rt, { audio: false });
  assert.deepEqual(Array.from(page.window.__ran), [...GAME.slice(0, -1), ...MENUS, 'app.js']);
});

test('sessions: every required coverage counter above zero and the exercise ratios met (G2b)', () => {
  const s = J('sessions.json');
  const ex = s.meta.exercise;
  const ids = Object.keys(s.scenarios);
  assert.ok(ids.length >= 14, 'scenarios: ' + ids.length);
  let required = 0;
  for (const [id, sc] of Object.entries(s.scenarios)) {
    const c = sc.coverage;
    for (const k of sc.meta.required) {
      required++;
      assert.ok(c[k] > 0, `${id}.${k} = ${c[k]}`);
    }
    assert.ok(c.scriptedFrames >= ex.minScripted * sc.meta.frames, id + ' scripted frames');
    assert.ok(c.flightChangedCheckpoints >= ex.minFlightChange * c.activeCheckpoints, id + ' flight changed');
    assert.ok(c.movingCheckpoints >= ex.minMoving * c.activeCheckpoints, id + ' moving');
  }
  assert.ok(required >= 73, 'required counters: ' + required);
});

test('HUD fixed states drawn over a live helicopter; cockpit and free look differ (G2e)', () => {
  for (const [k, r] of Object.entries(J('hud.json').runs)) {
    assert.ok(r.aliveBeforeFixed && r.runningBeforeFixed, k);
    assert.notEqual(r.fixed.cockpit, r.fixed.freeLook, k);
  }
});

test('module goldens: the Verba reload race is gone (declared fix R5.7) and the gunners still reload after launching', () => {
  const g = J('modules.json').ground;
  assert.equal(g.verbaReloadSkipped.count, 0);
  assert.ok(g.verbaReloadStarted.count > 0);
});

test('touchdowns straddle every crash threshold (G2a)', () => {
  const td = Object.entries(J('flight.json').runs).filter(([k]) => k.startsWith('touchdown-'));
  assert.ok(td.length >= 10, 'touchdown runs: ' + td.length);
  for (const [k, r] of td) {
    assert.ok(r.outcome.touched, k + ' touched');
    assert.equal(r.outcome.crashed, /^touchdown-(fast|hard-4\.8|tilt-35)/.test(k), k + ' crash outcome');
  }
});

test('joysticks: gates G-J2 and G-J3 hold, nothing read with the HOTAS off, B0 runs exercised, no real read (J3)', () => {
  const j = J('joystick.json');
  // G-J2: resting sticks with the HOTAS on = keys and mouse with the HOTAS off; G-J3: full deflections and buttons = keys.
  for (const id of ['G-J2', 'G-J3']) {
    const g = j.runs[id].gate;
    assert.equal(g.holds, true, id);
    assert.deepEqual(g.differences, [], id);
    assert.equal(g.reads[g.runs[0]].total, 0, id + ': no joystick read with the HOTAS off, menu included');
    assert.equal(g.reads[g.runs[1]].beforeStart, 0, id + ': nothing read in the menu with the HOTAS on');
    assert.ok(g.reads[g.runs[1]].total > 0, id + ': the HOTAS run reads the sticks');
    assert.ok(j.runs[id].checkpoints.length >= 30, id + ' checkpoints');
  }
  assert.equal(j.runs['G-J2'].meta.joysticks.keys, null, 'G-J2: no joystick block with the HOTAS off');
  // B0 runs: every event each one exists for, and a held or consumed press never fires.
  for (const id of ['vjoy-b0', 'twins']) {
    const r = j.runs[id];
    for (const k of r.meta.required) assert.ok((r.events[k] ?? r.coverage[k]) > 0, `${id}.${k}`);
    assert.equal(r.coverage.deaths, 0, id + ': the helicopter flies through');
  }
  assert.equal(j.runs['vjoy-b0'].events.shotsWhileLatched, 0, 'a trigger held through a resume is latched');
  assert.equal(j.runs['vjoy-b0'].events.hatLookFrames, 0, 'the hat of a vJoy device (layout not known) moves nothing');
  assert.equal(j.runs.twins.events.shotsWhileConfirming, 0, 'the press that confirms the sticks never fires');
  assert.equal(
    j.runs.twins.events.flewWhileProposed,
    0,
    'two identical sticks fly nothing before their roles are confirmed',
  );
  // B0 placeholders, labelled as supposed; public defaults = the game's factory values (HOTAS off, no device).
  assert.equal(j.law.descriptor.status, 'supposé');
  const d = j.law.defaults;
  assert.deepEqual([d.useHotas, d.devices, d.actions], [false, { main: null, left: null, right: null }, {}]);
  for (const a of Object.values(d.axes))
    assert.deepEqual([a.device, a.sensitivity, a.deadZone, a.invert], [null, 1, 0.05, false]);
  // Under automation, the page's emulation answers and the browser's getGamepads is never called.
  assert.deepEqual(j.automation, {
    emulated: true,
    emulatedList: true,
    padsListedBefore: 0,
    padsListed: 1,
    listedIsVjoy: true,
    running: true,
    emulatedStickPitches: true,
    realGamepadReads: 0,
  });
});

test('automation boot: the pointer lock is emulated and nothing real is ever called (safety)', () => {
  const lock = J('hookapi.json').automationPointerLock;
  assert.deepEqual(lock, {
    emulated: true,
    runningAfterStart: true,
    lockedAfterStart: true,
    pausedAfterMenu: true,
    unlockedAfterPause: true,
    realLockCalls: 0,
    realExitCalls: 0,
    fullscreenCalls: 0,
    keyboardLockCalls: 0,
  });
});
