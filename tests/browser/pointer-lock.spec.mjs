// The mouse through the page's emulated pointer lock in a real browser (the events Playwright dispatches keep their
// movementX/Y; the machine's cursor is never captured): with the measured rate law a 200 px swipe turns the nose by
// about K x 200 px and then stops; with the v12 virtual stick chosen, the same swipe turns much more and keeps turning.
// Frames at 100 Hz (manual clock); K is read from the page's own settings.
import { test, expect, openTrainer, diag, start, frames, seconds, hold, leave, keyFor } from './fixtures.mjs';

// chosen: a fixed test gain product (sensitivity x multiplier) this spec was calibrated with, stored as a profile so
// that the spec does not follow the public defaults.
const GAIN = {
  version: 1,
  tuningRevision: 16,
  settings: { pitchSens: 40, yawSens: 20, vehicleMultiplier: 0.25, invertY: true },
  bindings: {},
};

test('rate law: about K x 200 px of nose-up that stops; the v12 stick: much larger and still turning', async ({
  page,
}) => {
  await openTrainer(page, { manualClock: true, profile: GAIN });
  await page.locator('[data-mode="free"]').click();
  await page.selectOption('#duration', '0');
  await start(page);
  await hold(page, await keyFor(page, 'collectiveUp'), 1.4);
  await seconds(page, 4);
  await page.mouse.move(800, 450);
  await frames(page, 10);
  const level = () =>
    page.evaluate(() => {
      const f = __app.flight;
      f.quaternion.identity();
      f.angular.set(0, 0, 0);
      f.cyclic.set(0, 0, 0);
      f.mouseRate.set(0, 0, 0);
      f.velocity.set(0, 0, 0);
      HeliPhysics.resetInput(__app.mouse);
    });
  // 200 px down in 20 moves over 0.4 s (two frames each; nose up with the Y axis inverted, down otherwise), then 1.5 s
  // and 2.5 s later. The changes are compared in the direction of the Y-axis setting (sign).
  const swipe = async (dy) => {
    await level();
    await seconds(page, 0.4);
    const a = (await diag(page)).attitude.pitch;
    let y = 450;
    for (let i = 1; i <= 20; i++) {
      y += dy / 20;
      await page.mouse.move(800, y);
      await frames(page, 2);
    }
    await seconds(page, 1.5);
    const b = (await diag(page)).attitude.pitch;
    await seconds(page, 1);
    const c = (await diag(page)).attitude.pitch;
    for (let i = 1; i <= 20; i++) {
      y -= dy / 20;
      await page.mouse.move(800, y);
    }
    return { change: b - a, after: c - b };
  };
  const s = (await diag(page)).settings;
  const sign = s.invertY ? 1 : -1;
  const expected = ((s.mouseRateScale * s.pitchSens * s.vehicleMultiplier) / 100) * 200;
  const along = ({ change, after }) => ({ change: change * sign, after: after * sign });
  const rate = along(await swipe(200));
  await page.evaluate(() => {
    const el = document.getElementById('mouseLaw');
    el.value = 'stick';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect((await diag(page)).settings.mouseLaw).toBe('stick');
  const stick = along(await swipe(200));
  await page.evaluate(() => {
    const el = document.getElementById('mouseLaw');
    el.value = 'rate';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(
    rate.change > 0.6 * expected && rate.change < 1.4 * expected,
    `rate law: ${rate.change} deg for ${expected} expected`,
  ).toBe(true);
  expect(Math.abs(rate.after), 'rate law: the nose has stopped 1.5 s after the mouse').toBeLessThan(0.5);
  expect(
    stick.change > 3 * rate.change && stick.after > 2,
    'v12 stick: much larger and still turning ' + JSON.stringify(stick),
  ).toBe(true);
  await leave(page);
});
