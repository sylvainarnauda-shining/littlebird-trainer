'use strict';
// Profile migration, export and import in the mocked-DOM application: a stored revision-13 profile moves to the
// measured mouse law and the v13 defaults with its personal values kept; export and re-import (revision 16); the
// revision 13, 14 and 15 migrations (yaw inertia 0.40 -> 0.35; the old mouse-gain default 0.271 -> 0.339 with the
// personal gains and fine factor kept, and no false claim for a v12-stick user); "restore the measured model"; the
// limits on imported values; and the import of the game's settings file (a synthetic file with neutral values).
// Notices are checked by their numbers and by the table of tests/helpers/ui-text.js. One boot, Math.random seeded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bootApp, fileEvent } = require('../helpers/mock-dom');
const { seedMathRandom, SEED } = require('../helpers/rng');
const { FIXTURES } = require('../helpers/paths');
const TEXT = require('../helpers/ui-text');
const PROFILES = require('../helpers/profiles');

seedMathRandom(SEED + 106);
const { P, M } = require('../helpers/runtime').modules();
const saved = PROFILES.revision13(P, M);
const S = bootApp({ profile: saved, manualClock: true });
const { app, el, hooks } = S;
const toast = () => el('toast').textContent;
const importText = (text) => el('import').onchange(fileEvent(text));
const vf = (h) => (2 * Math.atan((Math.tan((h * Math.PI) / 360) * 900) / 1600) * 180) / Math.PI;
const settings13 = PROFILES.revision13Settings(P, M);

test('revision 13 -> 16 at boot: measured mouse law and the v13 defaults; personal values and keys kept; a notice', () => {
  const c = app.cfg;
  assert.equal(c.mouseLaw, 'rate');
  assert.equal(c.leverHover, -0.14);
  assert.equal(c.cyclicYaw, 0);
  assert.equal(c.responseYaw, 0.35);
  assert.equal(c.mouseRateScale, 0.339);
  assert.equal(c.mouseYawScale, 0.339);
  assert.equal(c.chaseSpeedView, true);
  assert.equal(c.mouseFine, 1);
  assert.equal(c.gain, 0.06);
  assert.equal(c.mouseReturn, 3);
  assert.equal(c.volume, 0.3);
  assert.equal(c.pitchSens, 40);
  assert.equal(c.fovChase, 85);
  assert.equal(c.graphics, 'medium');
  assert.equal(app.bindings.fire, 'KeyF');
  assert.match(toast(), TEXT.migratedToRateLaw);
});

let exported = null;
test('export (revision 16), defaults, then import of the exported file restores it with no notice', async () => {
  app.cfg.mouseFine = 1.2;
  el('export').onclick();
  const text = await hooks.blob.text();
  const exp = JSON.parse(text);
  assert.equal(exp.tuningRevision, 16);
  assert.equal(exp.settings.mouseLaw, 'rate');
  assert.equal(exp.settings.mouseFine, 1.2);
  assert.equal(exp.settings.mouseRateScale, 0.339);
  assert.equal(exp.bindings.fire, 'KeyF');
  el('defaults').onclick();
  assert.equal(app.bindings.fire, 'Mouse0');
  assert.equal(app.cfg.mouseFine, 1);
  await importText(text);
  assert.equal(app.cfg.mouseFine, 1.2, 'revision-16 file imported as is');
  assert.equal(app.cfg.mouseRateScale, 0.339);
  assert.equal(toast(), TEXT.profileImported, 'no notice for a revision-16 file');
  assert.equal(app.bindings.fire, 'KeyF');
  exported = exp;
});

test('import of a revision-13 file: stick gain and keys kept, measured law and hover lever, migration notice', async () => {
  assert.ok(exported, 'previous step ran');
  const old = JSON.stringify({ ...saved, settings: { ...settings13, gain: 0.07 }, bindings: { fire: 'KeyG' } });
  await importText(old);
  assert.equal(app.cfg.mouseLaw, 'rate');
  assert.equal(app.cfg.gain, 0.07, 'revision-13 file: stick gain kept');
  assert.equal(app.bindings.fire, 'KeyG');
  assert.equal(app.cfg.leverHover, -0.14);
  assert.ok(toast().startsWith(TEXT.profileImported), 'import confirmed');
  assert.match(toast(), TEXT.migratedToRateLaw, 'migration notice shown on import');
});

test('revision 14: the old 0.40 s yaw default moves to 0.35 s with a notice; a personal value is kept silently', async () => {
  for (const [ry, expect] of [
    [0.4, 0.35],
    [0.5, 0.5],
  ]) {
    const r14 = JSON.stringify({
      version: 1,
      tuningRevision: 14,
      settings: { ...settings13, gain: 0.07, mouseLaw: 'rate', responseYaw: ry },
      bindings: { fire: 'KeyG' },
    });
    await importText(r14);
    assert.equal(app.cfg.responseYaw, expect, 'revision 14, responseYaw ' + ry);
    if (ry === 0.4) assert.match(toast(), TEXT.yawInertiaNotice);
    else assert.equal(toast(), TEXT.profileImported);
  }
});

const imp = async (rev, s) => {
  const f = JSON.stringify({
    version: 1,
    tuningRevision: rev,
    settings: { ...settings13, gain: 0.07, mouseLaw: 'rate', responseYaw: 0.35, ...s },
    bindings: { fire: 'KeyG' },
  });
  await importText(f);
  return { pitch: app.cfg.mouseRateScale, yaw: app.cfg.mouseYawScale, fine: app.cfg.mouseFine, toast: toast() };
};

test('revision 15: the old mouse-gain default 0.271 becomes 0.339 with a notice (its gesture turns 25 % more)', async () => {
  const r = await imp(15, { mouseRateScale: 0.271, mouseYawScale: 0.271 });
  assert.deepEqual([r.pitch, r.yaw, r.fine], [0.339, 0.339, 1], 'old default 0.271 -> 0.339');
  assert.ok(r.toast.startsWith(TEXT.profileImported));
  assert.match(r.toast, TEXT.gainChange);
  assert.match(r.toast, TEXT.gainClaimPercent);
});

test('revision 15: personal gains are kept with no notice; the fine factor stays and the notice names it', async () => {
  let r = await imp(15, { mouseRateScale: 0.3, mouseYawScale: 0.25 });
  assert.deepEqual([r.pitch, r.yaw], [0.3, 0.25], 'personal gains kept');
  assert.equal(r.toast, TEXT.profileImported, 'no gain notice for personal values');
  r = await imp(15, { mouseRateScale: 0.271, mouseYawScale: 0.271, mouseFine: 1.25 });
  assert.deepEqual([r.pitch, r.yaw, r.fine], [0.339, 0.339, 1.25], 'fine factor kept');
  assert.match(r.toast, TEXT.gainChange);
  assert.match(r.toast, TEXT.fineFactorKept, 'the notice names the fine factor');
  r = await imp(15, { mouseRateScale: 0.271, mouseYawScale: 0.3 });
  assert.deepEqual([r.pitch, r.yaw], [0.339, 0.3], 'yaw set by hand kept');
  assert.match(r.toast, TEXT.gainChangePitchOnly);
});

test('revision 14 with the old gain: both notices, yaw inertia first', async () => {
  const r = await imp(14, { mouseRateScale: 0.271, mouseYawScale: 0.271, responseYaw: 0.4 });
  assert.deepEqual([r.pitch, r.yaw], [0.339, 0.339]);
  assert.equal(app.cfg.responseYaw, 0.35);
  const a = r.toast.search(TEXT.yawInertiaNotice);
  const b = r.toast.search(TEXT.gainChange);
  assert.ok(r.toast.startsWith(TEXT.profileImported) && a > 0 && b > a, 'both notices, in order');
});

test('revision 15 flown with the v12 stick: the gain value is migrated, the law kept, and no 25 % claim is made', async () => {
  const r = await imp(15, { mouseLaw: 'stick', mouseRateScale: 0.271, mouseYawScale: 0.271 });
  assert.deepEqual([r.pitch, r.yaw], [0.339, 0.339], 'stick user: value migrated');
  assert.equal(app.cfg.mouseLaw, 'stick', 'stick law kept');
  assert.match(r.toast, TEXT.gainChange);
  assert.match(r.toast, TEXT.stickUnchanged, 'the notice says the stick is unchanged');
  assert.doesNotMatch(r.toast, TEXT.gainClaimPercent, 'no false 25 % claim for a stick user');
});

test('"restore the measured model": law, hover lever, yaw lag, fine factor and gains reset; the stick gain kept', () => {
  Object.assign(app.cfg, {
    mouseFine: 5,
    mouseLaw: 'stick',
    leverHover: -0.3,
    cyclicYaw: 0.3,
    mouseRateScale: 0.3,
    mouseYawScale: 0.25,
  });
  el('demanding').onclick();
  assert.deepEqual(
    [
      app.cfg.mouseLaw,
      app.cfg.leverHover,
      app.cfg.cyclicYaw,
      app.cfg.mouseFine,
      app.cfg.mouseRateScale,
      app.cfg.mouseYawScale,
    ],
    ['rate', -0.14, 0, 1, 0.339, 0.339],
    'measured model restored',
  );
  assert.equal(app.cfg.gain, 0.07, 'personal stick gain kept');
  assert.match(toast(), TEXT.measuredModelRestored);
});

test('imported values are limited: fine factor within x0.7-1.4, an unknown mouse law refused', async () => {
  const big = JSON.stringify({
    version: 1,
    tuningRevision: 14,
    settings: { ...settings13, mouseFine: 3, mouseLaw: 'joystick' },
    bindings: {},
  });
  await importText(big);
  assert.equal(app.cfg.mouseFine, 1.4, 'fine factor limited to x0.7-1.4');
  assert.equal(app.cfg.mouseLaw, 'rate', 'unknown law refused');
});

test("the game's settings file: helicopter mouse settings and vehicle fields of view imported (synthetic neutral file)", async () => {
  const ini = fs.readFileSync(path.join(FIXTURES, 'synthetic', 'game-settings.sample.txt'), 'utf8');
  await el('importGame').onchange(fileEvent(ini));
  assert.equal(app.cfg.pitchSens, 35);
  assert.equal(app.cfg.yawSens, 12);
  assert.equal(app.cfg.vehicleMultiplier, 0.75);
  assert.equal(app.cfg.invertY, false);
  assert.equal(app.cfg.fovCockpit, 90);
  assert.equal(app.cfg.fovChase, 75);
  assert.match(toast(), TEXT.gameSettingsImported);
  app.setConfig({ scenario: 'free', duration: 0 });
  app.start();
  app.setView('chase');
  app.updateCamera();
  assert.ok(Math.abs(app.camera.fov - vf(75)) < 1e-6, 'chase field of view from the file');
  app.setView('cockpit');
});
