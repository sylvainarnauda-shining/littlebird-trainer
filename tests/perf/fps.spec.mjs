// Frame rate with the real-time loop on the local GPU (budgets: 45 fps hovering over the valley forest, 40 fps in a duel
// against two bots). Measured and reported always; enforced only with LB_PERF=1 on a known machine. Same safety fixture
// as the browser specs (headless, capture APIs trapped, emulation asserted before Start).
import { test, expect, openTrainer, diag, start, leave, keyFor } from '../browser/fixtures.mjs';

const ENFORCE = process.env.LB_PERF === '1';
function budget(testInfo, what, fps, min) {
  testInfo.annotations.push({ type: 'fps', description: `${what}: ${fps.toFixed(1)} fps (budget ${min})` });
  console.log(`${what}: ${fps.toFixed(1)} fps (budget ${min})`);
  if (ENFORCE) expect(fps, what).toBeGreaterThanOrEqual(min);
}

test('hovering over the valley: 45 fps or more', async ({ page }, testInfo) => {
  await openTrainer(page);
  await page.locator('[data-mode="free"]').click();
  await start(page);
  const up = await keyFor(page, 'collectiveUp');
  await page.keyboard.down(up);
  await page.waitForTimeout(1000);
  await page.keyboard.up(up);
  await page.waitForTimeout(7000);
  budget(testInfo, 'valley hover', (await diag(page)).fps, 45);
  await leave(page);
});

test('duel against two bots: 40 fps or more', async ({ page }, testInfo) => {
  await openTrainer(page);
  await page.locator('[data-mode="duel"]').click();
  await page.locator('#duelBots').fill('2');
  await page.locator('#duelBots').dispatchEvent('input');
  await start(page);
  const up = await keyFor(page, 'collectiveUp');
  await page.keyboard.down(up);
  await page.waitForTimeout(1500);
  await page.keyboard.up(up);
  await page.waitForTimeout(10000);
  budget(testInfo, 'duel with two bots', (await diag(page)).fps, 40);
  await leave(page);
});
