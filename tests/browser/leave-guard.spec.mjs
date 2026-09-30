// Leaving the page during a session (declared behaviour, CHANGELOG 0.9.0): Ctrl+W closes a browser tab and no page can
// cancel it, while the default keys put collective down on Left Ctrl and pitch down on W. The page's beforeunload
// handler asks the browser to confirm while a session is in progress (flying or paused), not in the menu before and not
// on the results screen. Playwright's key presses never reach the browser's own shortcuts, so the checks dispatch the
// event, then ask Chrome to close the page and expect its confirmation dialog (dismissed: the page stays).
import { test, expect, openTrainer, start, seconds, leave } from './fixtures.mjs';

const asksToConfirm = (page) =>
  page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });

test('beforeunload: no question in the menu, one while a session flies or is paused, none on the results screen', async ({
  page,
}) => {
  await openTrainer(page, { manualClock: true });
  expect(await asksToConfirm(page), 'menu before any session').toBe(false);
  await page.locator('[data-mode="free"]').click();
  await start(page);
  await seconds(page, 0.5);
  expect(await asksToConfirm(page), 'flying').toBe(true);
  await leave(page);
  expect(await asksToConfirm(page), 'paused').toBe(true);
  // Chrome itself: closing the page during the session shows its "leave site?" dialog; dismissing it keeps the page.
  const dialog = new Promise((resolve) =>
    page.once('dialog', async (d) => {
      const type = d.type();
      await d.dismiss();
      resolve(type);
    }),
  );
  await page.close({ runBeforeUnload: true });
  expect(await dialog).toBe('beforeunload');
  expect(page.isClosed(), 'the page stays after "stay"').toBe(false);
  await page.evaluate(() => window.__app.finish('Session terminée'));
  expect(await asksToConfirm(page), 'results screen').toBe(false);
});
