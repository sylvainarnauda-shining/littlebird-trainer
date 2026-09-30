// Maps in a real browser (manual clock): the map card of the reference valley and the eight light presets in the menu,
// a foggy preset flown, a generated map opened from its shared address (#carte=gen-N: name, towers, forest, village,
// take-off), then the menu buttons that draw a new generated map and come back to the valley (each reloads the page).
import { test, expect, openTrainer, diag, start, seconds, hold, leave, keyFor } from './fixtures.mjs';
import NAMES from '../helpers/names.js';
import TEXT from '../helpers/ui-text.js';

test('map card of the reference valley; the light menu offers "random" and the eight presets', async ({ page }) => {
  await openTrainer(page, { manualClock: true });
  await page.locator('[data-mode="free"]').click();
  expect(await page.locator('#mapName').textContent()).toBe(await page.evaluate(() => HeliWorld.create('vallee').name));
  expect(await page.locator('#mapInfo').textContent()).toMatch(TEXT.valleySummary);
  expect(await page.locator('#lighting option').count(), 'random + the 8 presets').toBe(9);
});

test('a foggy preset chosen in the menu is the light of the session', async ({ page }) => {
  await openTrainer(page, { manualClock: true });
  await page.locator('[data-mode="free"]').click();
  await page.selectOption('#lighting', NAMES.foggyMorning);
  await start(page);
  const s = await diag(page);
  expect(s.light.name).toBe(NAMES.foggyMorning);
  expect(s.light.fog, 'fog').toBeGreaterThanOrEqual(0.0005);
  await hold(page, await keyFor(page, 'collectiveUp'), 1.6);
  await seconds(page, 1);
  await leave(page);
});

test('a generated map from its address: name, three towers, a forest and a village, a take-off; new map and back to the valley', async ({
  page,
}) => {
  await openTrainer(page, { hash: '#carte=gen-123456', manualClock: true });
  let g = await diag(page);
  const name = await page.evaluate(() => HeliWorld.mapName(123456));
  expect(g.map.id).toBe('gen-123456');
  expect(g.map.generated).toBe(true);
  expect(g.map.name).toBe(name);
  expect(await page.locator('#mapName').textContent()).toBe(name);
  expect(g.map.towers.length).toBe(3);
  expect(
    g.scenery.trees > 150000 && g.scenery.houses >= 12,
    `a forest and a village: ${g.scenery.trees} trees, ${g.scenery.houses} houses`,
  ).toBe(true);
  await page.locator('[data-mode="free"]').click();
  await page.selectOption('#lighting', NAMES.referenceAfternoon);
  await start(page);
  await hold(page, await keyFor(page, 'collectiveUp'), 2.5);
  await seconds(page, 3);
  g = await diag(page);
  const agl = await page.evaluate((p) => p[1] - HeliPhysics.terrain(p[0], p[2]), g.position);
  expect(!g.onGround && agl > 6, 'took off on the generated map: ' + agl).toBe(true);
  await leave(page);
  await page.locator('#pauseModes').click();
  const before = (await diag(page)).map.id;
  await Promise.all([page.waitForEvent('load'), page.locator('#mapNew').click()]);
  await page.waitForFunction(() => window.__app && !document.getElementById('start').disabled, null, {
    timeout: 180_000,
  });
  const next = (await diag(page)).map;
  expect(next.generated && next.id !== before, 'a new generated map: ' + next.id).toBe(true);
  await Promise.all([page.waitForEvent('load'), page.locator('#mapVideo').click()]);
  await page.waitForFunction(() => window.__app && !document.getElementById('start').disabled, null, {
    timeout: 180_000,
  });
  expect((await diag(page)).map.id, 'back to the reference valley').toBe('vallee');
});
