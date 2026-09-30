// Smoke test of the built page in a real browser: the automation pointer-lock emulation before anything else, a
// WebGL2 context drawing, the menu, an old stored profile migrated, then a free flight: landed on the helipad, the sound
// engine, a take-off to a hover with the forest, post-processing, the 3D cockpit, a burst from the miniguns, and the
// pause screen. Frames are driven at 100 Hz by the test (manual clock).
import { test, expect, openTrainer, diag, start, seconds, hold, leave, audioSettled, keyFor } from './fixtures.mjs';

// A revision-7 profile: its keys, sensitivities and choices are kept, the settings added later take their defaults.
const REVISION_7 = {
  version: 1,
  tuningRevision: 7,
  settings: {
    rollRate: 80,
    pitchSens: 23,
    yawSens: 9,
    invertY: true,
    impactDamage: 0,
    rpm: 1500,
    scenario: 'free',
    duration: 0,
  },
  bindings: { fire: 'KeyF' },
};

test('boots with the pointer lock emulated, WebGL2 drawing, an old profile migrated, the menu shown', async ({
  page,
}) => {
  await openTrainer(page, { profile: REVISION_7, manualClock: true });
  expect(await page.evaluate(() => !!document.getElementById('world').getContext('webgl2'))).toBe(true);
  await seconds(page, 0.2);
  let s = await diag(page);
  expect(s.webgl.calls, 'WebGL draw calls').toBeGreaterThan(0);
  expect(await page.locator('#menu').isVisible(), 'menu after loading').toBe(true);
  expect(await page.locator('#loading').isVisible(), 'loading screen gone').toBe(false);
  expect([s.settings.pitchSens, s.settings.yawSens]).toEqual([23, 9]);
  expect([s.bindings.fire, s.bindings.flares, s.bindings.shop]).toEqual(['KeyF', 'KeyV', 'KeyB']);
  expect(s.scenery.trees, 'forest of about 290 000 trees').toBeGreaterThan(250000);
});

test('free flight: landed at idle, sound running, take-off to a hover, forest and effects, a burst, the pause screen', async ({
  page,
}) => {
  await openTrainer(page, { profile: REVISION_7, manualClock: true });
  await page.locator('[data-mode="free"]').click();
  await start(page);
  await seconds(page, 0.6);
  let s = await diag(page);
  expect(s.onGround && s.collective < -0.9, 'landed at idle lever').toBe(true);
  expect(s.audio.state, 'sound engine running').toBe('running');
  await hold(page, await keyFor(page, 'collectiveUp'), 1);
  await seconds(page, 7);
  s = await diag(page);
  const agl = await page.evaluate((p) => p[1] - HeliPhysics.terrain(p[0], p[2]), s.position);
  expect(!s.onGround && agl > 6 && agl < 45, 'take-off to a hover: ' + agl).toBe(true);
  expect(await audioSettled(page, () => trainerDiagnostics().audio.rotorGain > 0.3), 'rotor heard').toBe(true);
  expect(s.view).toBe('cockpit');
  expect(s.graphics.post && s.graphics.environment, 'post-processing and sky lighting').toBe(true);
  expect(s.scenery.bushes > 2000 && s.scenery.rocks > 1000, 'bushes and stones').toBe(true);
  expect(s.settings.fovCockpit).toBe(await page.evaluate(() => HeliPhysics.defaults.fovCockpit));
  const before = s.stats.shots;
  await page.keyboard.down('f');
  await seconds(page, 1.5);
  expect(await audioSettled(page, () => trainerDiagnostics().audio.spinGain > 0.05), 'barrel spin heard').toBe(true);
  await page.keyboard.up('f');
  s = await diag(page);
  const burst = s.stats.shots - before;
  expect(burst >= 24 && burst <= 34, '1.5 s burst: ' + burst).toBe(true);
  await page.keyboard.press('Escape');
  await seconds(page, 0.2);
  expect(await page.locator('#pause').isVisible(), 'pause screen').toBe(true);
  await page.locator('#pauseResume').click();
  await page.waitForFunction(() => trainerDiagnostics().running);
  await leave(page);
});
