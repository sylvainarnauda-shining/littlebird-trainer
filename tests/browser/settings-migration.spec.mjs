// Stored profiles in a real browser (neutral test values): a revision-12 profile moves to the missiles of the databases,
// a revision-13 profile to the measured mouse law and the v13 defaults with its personal values and the settings panels
// showing them, a revision-15 profile from the old mouse-gain default (saved back at revision 16); then export, reset,
// import of the exported file, and the menu at 720p.
import fs from 'node:fs';
import { test, expect, openTrainer, diag } from './fixtures.mjs';
import TEXT from '../helpers/ui-text.js';

test('revision 12 -> the missiles of the databases (two hits, 450 m/s); sensitivities kept', async ({ page }) => {
  await openTrainer(page, {
    profile: {
      version: 1,
      tuningRevision: 12,
      settings: { aaHitsToKill: 1, aaMissileSpeed: 300, pitchSens: 26, yawSens: 13, scenario: 'free' },
      bindings: {},
    },
  });
  const m = (await diag(page)).settings;
  expect([m.aaHitsToKill, m.aaMissileSpeed, m.pitchSens]).toEqual([0, 450, 26]);
});

test('revision 13 -> measured mouse law and v13 defaults, personal values kept, notice shown; the panels show them', async ({
  page,
}) => {
  const settings = {
    pitchSens: 40,
    yawSens: 20,
    vehicleMultiplier: 0.25,
    invertY: true,
    fovCockpit: 85,
    fovChase: 85,
    gain: 0.06,
    mouseReturn: 3,
    volume: 0.3,
    scenario: 'free',
  };
  await openTrainer(page, { profile: { version: 1, tuningRevision: 13, settings, bindings: { fire: 'KeyF' } } });
  const m = (await diag(page)).settings;
  expect([
    m.mouseLaw,
    m.leverHover,
    m.cyclicYaw,
    m.responseYaw,
    m.mouseRateScale,
    m.mouseYawScale,
    m.chaseSpeedView,
  ]).toEqual(['rate', -0.14, 0, 0.35, 0.339, 0.339, true]);
  expect([m.gain, m.mouseReturn, m.volume, m.pitchSens, m.fovChase]).toEqual([0.06, 3, 0.3, 40, 85]);
  expect(await page.locator('#toast').textContent()).toMatch(TEXT.migratedToRateLaw);
  await page.locator('[data-tab="controls"]').click();
  expect(await page.locator('#mouseLaw').inputValue()).toBe('rate');
  await page.locator('[data-tab="settings"]').click();
  await page.locator('.flight-tuning summary').click();
  expect(await page.locator('#mouseRateScale').inputValue()).toBe('0.339');
  expect(await page.locator('#leverHover').inputValue()).toBe('-0.14');
  expect(await page.locator('#cyclicYaw').inputValue()).toBe('0');
  expect(await page.locator('#chaseSpeedView').isChecked()).toBe(true);
});

test('revision 15 with the old gain default 0.271 -> 0.339, the fine factor kept, a notice; saved back at revision 16', async ({
  page,
}) => {
  const settings = {
    pitchSens: 40,
    yawSens: 20,
    vehicleMultiplier: 0.25,
    invertY: true,
    mouseLaw: 'rate',
    mouseRateScale: 0.271,
    mouseYawScale: 0.271,
    mouseFine: 1.1,
    responseYaw: 0.35,
    scenario: 'free',
  };
  await openTrainer(page, { profile: { version: 1, tuningRevision: 15, settings, bindings: {} } });
  const m = (await diag(page)).settings;
  expect([m.mouseRateScale, m.mouseYawScale, m.mouseFine]).toEqual([0.339, 0.339, 1.1]);
  const toast = await page.locator('#toast').textContent();
  expect(toast).toMatch(TEXT.gainChange);
  expect(toast).toMatch(/×1,1\b/);
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), 'littlebird-range-v1');
  expect(stored.tuningRevision, 'profile saved at revision 16 after the notice').toBe(16);
  expect(stored.settings.mouseRateScale).toBe(0.339);
});

test('export (revision 16), reset to the defaults, import of the exported file; the menu at 720p', async ({
  page,
}, testInfo) => {
  await openTrainer(page, {
    profile: { version: 1, tuningRevision: 16, settings: { scenario: 'free' }, bindings: { fire: 'KeyF' } },
  });
  await page.locator('[data-tab="settings"]').click();
  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  const file = await download;
  const saved = testInfo.outputPath('profil.json');
  await file.saveAs(saved);
  const exported = JSON.parse(fs.readFileSync(saved, 'utf8'));
  expect(exported.tuningRevision).toBe(16);
  expect(exported.settings.mouseRateScale).toBe(0.339);
  expect(exported.settings.yawRate).toBe(36);
  expect(exported.settings.mouseLaw).toBe('rate');
  expect(exported.bindings.fire).toBe('KeyF');
  await page.locator('#defaults').click();
  expect((await diag(page)).bindings.fire).toBe('Mouse0');
  await page.locator('#import').setInputFiles(saved);
  await page.waitForFunction(() => trainerDiagnostics().bindings.fire === 'KeyF');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('[data-tab="modes"]').click();
  expect(await page.locator('#start').isVisible()).toBe(true);
});
