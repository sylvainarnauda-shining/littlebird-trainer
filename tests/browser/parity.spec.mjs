// G5 engine parity in the browser (docs/FIDELITE.md): the golden parity script (desktop/parity.cjs) run by the built page's own
// flight module in this browser's engine. The digest must be one of the two references (the Node golden, or Chromium's
// V8 as measured in Electron 44.4.5 and Chrome 154) and every 5 s state within the tolerance of the Node golden.
// Same safety fixture as every spec: headless, capture APIs trapped, emulated pointer lock asserted (nothing is
// clicked here).
import { createRequire } from 'node:module';
import { test, expect, openTrainer } from './fixtures.mjs';

const parity = createRequire(import.meta.url)('../../desktop/parity.cjs');

test('G5: the page engine replays the golden parity script', async ({ page }) => {
  await openTrainer(page);
  const r = await page.evaluate(parity.pageExpression());
  const v = parity.compare(r);
  test.info().annotations.push({
    type: 'G5',
    description: `${v.engine} digest ${r.final.slice(0, 16)}; largest position difference ${v.maxDelta.position} m`,
  });
  expect(v.script, 'the same input script').toBe(true);
  expect(v.within, 'every sample within the tolerance of the Node golden').toBe(true);
  expect(v.engine, 'a known engine digest').not.toBe('unknown');
});
