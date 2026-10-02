// The settings core in a real browser. The page 0.9 validated a profile with the min, max and step its own sliders carry;
// the page now takes them from the table of settings-data.js (HeliSettings.BOUNDS) and reads no DOM. Here the browser's
// own reading of the sliders is the reference: the two agree, value by value, and a stored profile full of hostile
// values boots to valid settings. Nothing is started, nothing is captured (openTrainer asserts the emulated pointer lock).
import { test, expect, openTrainer } from './fixtures.mjs';

test('sanitize with the table gives what the page sliders give, for every setting that has a slider', async ({
  page,
}) => {
  await openTrainer(page, { manualClock: true });
  const report = await page.evaluate(() => {
    const sliders = [...document.querySelectorAll('input[type=range]')].filter(
      (el) => typeof HeliSettings.defaults[el.id] === 'number',
    );
    // What the page 0.9 did with a number: clamp to the slider's range, then round when its step is 1 or more.
    const bySlider = (el, v) => {
      const clamped = Math.min(Number(el.max), Math.max(Number(el.min), v));
      return Number(el.step) >= 1 ? Math.round(clamped) : clamped;
    };
    const different = [];
    for (const el of sliders) {
      const lo = Number(el.min);
      const hi = Number(el.max);
      for (const v of [lo - 7, hi + 7, lo + (hi - lo) * 0.37, lo + (hi - lo) * 0.5, lo, hi]) {
        const got = HeliSettings.sanitize({ [el.id]: v })[el.id];
        if (!Object.is(got, bySlider(el, v))) different.push(`${el.id}: ${v} -> ${got}`);
      }
    }
    return { sliders: sliders.length, bounds: Object.keys(HeliSettings.BOUNDS).length, different };
  });
  expect(report).toEqual({ sliders: 71, bounds: 71, different: [] });
});

test('a stored profile with hostile values boots to valid settings and keeps its key bindings', async ({ page }) => {
  const settings = {
    pitchSens: 1e9,
    fovCockpit: 500,
    targetCount: 2.6,
    lighting: 'constructor',
    graphics: 'ultra',
    duration: 45,
  };
  const profile = { version: 1, tuningRevision: 16, settings, bindings: { fire: 'KeyF', flares: 'NotAKey' } };
  await openTrainer(page, { profile, manualClock: true });
  const state = await page.evaluate(() => ({ cfg: { ...window.__app.cfg }, bindings: { ...window.__app.bindings } }));
  expect(state.cfg).toMatchObject({
    pitchSens: 100,
    fovCockpit: 120,
    targetCount: 3,
    lighting: 'random',
    graphics: 'high',
    duration: 120,
  });
  expect(state.bindings).toMatchObject({ fire: 'KeyF', flares: 'KeyV' });
});
