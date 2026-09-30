// Browser tests of the built page (dist/web/index.html, built by `npm run test:browser` first).
// Safety: always headless, one worker, and every spec goes through tests/browser/fixtures.mjs, which traps the real
// pointer lock, fullscreen and keyboard lock before any page script runs and asserts the page's own automation
// pointer-lock emulation before any Start click. Nothing here can capture the machine's mouse or keyboard.
// Browser: the installed Chrome locally (channel 'chrome'); in CI (CI=1) the Chromium that `npx playwright install
// chromium` downloads. LB_BROWSER_CHANNEL overrides the channel ('' for the bundled Chromium).
// Graphics: LB_GL=gpu (default locally) | warp (Windows software, the CI default on Windows) | swiftshader.
// Scope and time: `npm run test:browser` runs every spec (about 2 minutes on a GPU); `npm run test:browser:ci` leaves out
// the tests tagged @gpu, which render too many frames for software WebGL (tests/browser/fixtures.mjs, Scope). With
// software WebGL a page takes about a minute to boot (measured with WARP and 4 CPUs: 1.2 to 2.4 minutes per test), so
// CI allows LB_BROWSER_TEST_MIN minutes per test (15 by default: the map test boots three pages, and a boot took more
// than 3 minutes on a busy windows-2025 runner on 30/09) and a whole run LB_BROWSER_BUDGET_MIN minutes (50 by
// default), after which Playwright stops and fails the run: the CI job ends in a bounded time (ci.yml splits it into two
// shards). The nightly SwiftShader job, slower, sets both (nightly.yml). A value that is not a number of minutes above
// zero stops the run: a typo must not remove a bound.
import { defineConfig } from '@playwright/test';

const ci = !!process.env.CI;
const minutes = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!(Number.isFinite(n) && n > 0)) throw new Error(`${name} must be a number of minutes above zero, not "${raw}"`);
  return n;
};
const gl = process.env.LB_GL || (ci ? (process.platform === 'win32' ? 'warp' : 'swiftshader') : 'gpu');
const GL_ARGS = {
  gpu: ['--enable-gpu', '--ignore-gpu-blocklist'],
  warp: ['--use-angle=d3d11-warp'],
  swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};
const channel =
  process.env.LB_BROWSER_CHANNEL !== undefined
    ? process.env.LB_BROWSER_CHANNEL || undefined
    : ci
      ? undefined
      : 'chrome';
const budgetMinutes = minutes('LB_BROWSER_BUDGET_MIN', 50);
const testMinutes = minutes('LB_BROWSER_TEST_MIN', 15);

export default defineConfig({
  testDir: 'tests/browser',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  // One worker everywhere; in CI, test by test instead of file by file, so that --shard splits the tests evenly.
  fullyParallel: ci,
  retries: 0, // flakes are fixed, never retried
  timeout: ci ? testMinutes * 60_000 : 240_000,
  globalTimeout: ci ? budgetMinutes * 60_000 : 0,
  expect: { timeout: 15_000 },
  outputDir: 'test-results/browser',
  reporter: ci ? [['list'], ['junit', { outputFile: 'test-results/browser-junit.xml' }]] : 'list',
  use: {
    headless: true,
    channel,
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required', ...(GL_ARGS[gl] || [])] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
