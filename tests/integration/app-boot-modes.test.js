'use strict';
// The application booted in a mocked DOM (tests/helpers/mock-dom.js): boot with the reference valley, migration of an
// old stored profile, the mode cards, the range drill (fields of view, 2 s burst, unlimited and limited ammunition),
// the towers, free flight and a wire strike, the forest cards and bushes, the map card and the eight light presets, the
// releases link of the À propos tab, and the free-look latch. One boot for the file, Math.random seeded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bootApp } = require('../helpers/mock-dom');
const { seedMathRandom, SEED } = require('../helpers/rng');
const NAMES = require('../helpers/names');
const TEXT = require('../helpers/ui-text');

seedMathRandom(SEED + 101);
const { P, M, G, W, T } = require('../helpers/runtime').modules();
// A revision-8 profile with its own sensitivity, the old lock range default and a fire key on V (the flare action,
// added later, must not steal it).
const profile = require('../helpers/profiles').revision8(P, M);
const t0 = Date.now();
const S = bootApp({ profile });
const bootMs = Date.now() - t0;
const { app, diag, el, keyDown, keyUp, run, modeCards, seg } = S;
const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const vf = (h) => (2 * Math.atan((Math.tan((h * Math.PI) / 360) * 900) / 1600) * 180) / Math.PI;

test('boot: the menu replaces the loading screen, Start enabled, the valley forest loaded, the spawn clear', (t) => {
  t.diagnostic('boot with the valley: ' + bootMs + ' ms');
  assert.equal(el('start').disabled, false);
  assert.ok(
    el('loading').classList.contains('hidden') && !el('menu').classList.contains('hidden'),
    'loading screen replaced by the menu',
  );
  assert.ok(diag().scenery.trees > 250000, 'forest of about 290 000 trees');
  assert.ok(!app.obstacles.hit(v(0, 70, 130), v(0, 70, 130), 6), 'spawn clear');
});

test('migration of a revision-8 profile: sensitivities and choices kept, new settings defaulted, no key stolen', () => {
  assert.equal(app.cfg.pitchSens, 23);
  assert.equal(app.cfg.aaLockRange, 1000, 'old 1 500 m default replaced by the launcher range of the guides');
  assert.equal(app.cfg.impactDamage, 78.01);
  assert.equal(app.cfg.flareCharges, 2);
  assert.equal(app.cfg.camps, G.defaults.camps);
  assert.equal(app.bindings.fire, 'KeyV');
  assert.equal(app.bindings.flares, 'Unbound');
  assert.equal(app.bindings.shop, 'KeyB');
  assert.equal(app.bindings.freeLook, 'AltLeft');
});

test('mode cards select the scenario; the range card keeps the air/ground/mixed choice', () => {
  modeCards.find((c) => c.dataset.mode === 'assault').onclick();
  assert.equal(app.cfg.scenario, 'assault');
  modeCards.find((c) => c.dataset.mode === 'range').onclick();
  assert.equal(app.cfg.scenario, 'air');
  seg[1].onclick();
  assert.equal(app.cfg.scenario, 'ground');
  seg[0].onclick();
  assert.equal(app.cfg.scenario, 'air');
});

test('F27 range drill: targets move, the HUD draws, the chase field of view read as horizontal, level chase horizon', () => {
  app.setConfig({ scenario: 'air', trajectory: 'evasive', duration: 0 });
  app.start();
  run(8);
  assert.ok(diag().running);
  assert.ok(app.targets.some((t) => t.previous.distanceTo(t.group.position) > 0));
  app.updateCamera();
  app.drawHud();
  app.setView('chase');
  app.updateCamera();
  assert.equal(app.cfg.fovChase, P.defaults.fovChase);
  assert.ok(
    Math.abs(app.camera.fov - vf(app.cfg.fovChase)) < 1e-6,
    'chase view: the setting is a horizontal angle, as in the game',
  );
  app.flight.quaternion.setFromAxisAngle(v(0, 0, 1), 0.8);
  app.updateCamera();
  assert.ok(
    Math.abs(v(1, 0, 0).applyQuaternion(app.camera.quaternion).y) < 1e-6,
    'level horizon behind a banked helicopter',
  );
  app.setView('cockpit');
  app.flight.quaternion.identity();
});

test('F30 a 2 s burst with the spin-up fires ~42 rounds; unlimited ammunition by default in the range (300)', () => {
  keyDown('KeyV');
  for (let i = 0; i < 240; i++) app.step(1 / 120);
  keyUp('KeyV');
  assert.ok(app.stats.shots >= 41 && app.stats.shots <= 43, '2 s with spin-up: ' + app.stats.shots);
  assert.equal(app.ammo, 300, 'unlimited by default in the range');
});

test('limited ammunition: the counter drops and the guns stop at zero', () => {
  app.setConfig({ unlimitedAmmo: false });
  app.start();
  app.ammo = 20;
  keyDown('KeyV');
  for (let i = 0; i < 240; i++) app.step(1 / 120);
  keyUp('KeyV');
  assert.equal(app.ammo, 0);
  assert.equal(app.stats.shots, 20, 'no round without ammunition');
  app.setConfig({ unlimitedAmmo: true });
});

test('towers: defenders block the capture; cleared roofs are captured one after the other and end the session', () => {
  app.setConfig({ scenario: 'towers', targetCount: 6, duration: 0 });
  app.start();
  const tower = app.towers[0];
  app.flight.position.set(tower.x, tower.height + 12, tower.z);
  run(2);
  assert.equal(tower.capture, 0);
  for (const t of app.targets) {
    t.active = false;
    t.group.visible = false;
    t.respawn = 0;
  }
  for (const tw of app.towers) {
    app.flight.position.set(tw.x, tw.height + 12, tw.z);
    app.flight.velocity.set(0, 0, 0);
    for (let i = 0; i < 1210 && diag().running; i++) app.step(1 / 120);
    assert.ok(tw.captured);
  }
  assert.equal(diag().running, false);
});

test('free flight starts landed on the helipad at idle lever; a wire strike ends the session', () => {
  app.setConfig({ scenario: 'free', duration: 0 });
  app.start();
  assert.ok(app.flight.onGround && app.flight.collective === -1);
  run(2);
  assert.ok(app.flight.onGround);
  const w = app.wires[Math.floor(app.wires.length / 2)];
  app.flight.position.copy(w.a.clone().lerp(w.b, 0.5));
  app.flight.velocity.set(0, 0, 0);
  app.step(1 / 120);
  assert.equal(diag().running, false, 'wire strike');
});

test('card foliage with an atlas, bushes and stones around the play area', () => {
  const f = app.scenery.forest;
  assert.ok(f.near[0][0].material.alphaTest > 0 && f.near[0][0].material.map, 'foliage cards with an atlas');
  assert.ok(f.bushes && f.bushes.count > 2000, 'bushes: ' + (f.bushes && f.bushes.count));
  assert.ok(diag().scenery.rocks > 1000, 'stones and outcrops: ' + diag().scenery.rocks);
});

test('map card: the valley name and summary; the light menu offers "random" and the eight presets in order', () => {
  assert.equal(el('mapName').textContent, W.create('vallee').name);
  assert.match(el('mapInfo').textContent, TEXT.valleySummary);
  const sel = el('lighting');
  assert.equal(sel.children.length, 9, 'random + the 8 presets');
  assert.equal(sel.children[0].value, 'random');
  assert.deepEqual([...sel.children.slice(1).map((o) => o.value)], Object.keys(W.LIGHTS));
  assert.equal(sel.children[5].textContent, W.LIGHTS[NAMES.referenceAfternoon].label);
});

test('À propos: after boot the releases link and its text are the address the Windows shell allows', () => {
  const { RELEASES_URL } = require('../../desktop/policy.cjs');
  assert.equal(el('releasesLink').href, RELEASES_URL);
  assert.equal(el('releasesLink').textContent, RELEASES_URL);
});

test('light presets: applied on demand; one per session, the chosen one or drawn among the eight', () => {
  app.applyLight(NAMES.foggyMorning);
  let d = diag();
  assert.equal(d.light.name, NAMES.foggyMorning);
  assert.ok(Math.abs(d.light.fog - W.LIGHTS[NAMES.foggyMorning].fogD) < 1e-12, 'fog of the foggy preset');
  app.setConfig({ scenario: 'free', duration: 0, lighting: NAMES.eveningClear });
  app.start();
  d = diag();
  const L = W.LIGHTS[NAMES.eveningClear];
  const az = (L.az * Math.PI) / 180;
  const el2 = (L.el * Math.PI) / 180;
  assert.equal(d.light.name, NAMES.eveningClear);
  assert.ok(
    Math.abs(d.light.sun[0] - Math.sin(az) * Math.cos(el2)) < 1e-6 &&
      Math.abs(d.light.sun[1] - Math.sin(el2)) < 1e-6 &&
      Math.abs(d.light.sun[2] + Math.cos(az) * Math.cos(el2)) < 1e-6,
    'setting sun in the west',
  );
  const names = new Set();
  app.setConfig({ lighting: 'random' });
  for (let i = 0; i < 30; i++) {
    app.start();
    names.add(diag().light.name);
  }
  assert.ok(names.size >= 6, 'a preset drawn per session: ' + [...names].join(', '));
  app.setConfig({ lighting: NAMES.referenceAfternoon });
});

test('free look: held, or latched by a quick double press until the next press; pilot view snaps back, chase eases back', () => {
  const clock = S.clock;
  clock.now = 1000;
  try {
    app.setConfig({ scenario: 'free', duration: 0 });
    app.start();
    app.setView('cockpit');
    app.lookDown(false);
    assert.ok(app.freeLook.held);
    clock.now += 150;
    app.lookUp();
    assert.ok(!app.freeLook.held, 'released');
    clock.now += 150;
    app.lookDown(false);
    assert.ok(app.freeLook.latch, 'second press within 0.32 s: latched');
    clock.now += 120;
    app.lookUp();
    assert.ok(app.freeLook.held, 'stays on after the release');
    clock.now += 2000;
    app.lookDown(false);
    assert.ok(!app.freeLook.held && !app.freeLook.latch, 'next press: off');
    clock.now += 100;
    app.lookUp();
    assert.ok(!app.freeLook.held);
    clock.now += 2000;
    app.lookDown(false);
    clock.now += 100;
    app.lookUp();
    clock.now += 600;
    app.lookDown(false);
    assert.ok(!app.freeLook.latch, 'slow second press: no latch');
    clock.now += 100;
    app.lookUp();
    app.setLook(0.5, 0.2);
    app.lookUp();
    app.updateCamera(1 / 60);
    assert.equal(app.freeLook.yaw, 0, 'pilot view: snaps back');
    app.setView('chase');
    app.setLook(0.5, 0.2);
    app.lookUp();
    app.updateCamera(1 / 60);
    assert.ok(
      app.freeLook.yaw > 0.4 && app.freeLook.yaw < 0.5,
      'chase view: eases back (' + app.freeLook.yaw.toFixed(3) + ')',
    );
    app.setView('cockpit');
  } finally {
    clock.now = 0;
  }
});
