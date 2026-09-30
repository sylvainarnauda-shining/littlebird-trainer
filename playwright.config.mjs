// Browser tests of the built page (dist/web/index.html, built by `npm run test:browser` first).
// Safety: always headless, one worker, and every spec goes through tests/browser/fixtures.mjs, which traps the real
// pointer lock, fullscreen and keyboard lock before any page script runs and asserts the page's own automation
// pointer-lock emulation before any Start click. Nothing here can capture the machine's mouse or keyboard.
// Browser: the installed Chrome locally (channel 'chrome'); in CI (CI=1) the Chromium that `npx playwright install
// chromium` downloads. LB_BROWSER_CHANNEL overrides the channel ('' for the bundled Chromium).
// Graphics: LB_GL=gpu (default locally) | warp (Windows software, the CI default on Windows) | swiftshader.
import { defineConfig } from '@playwright/test';

const ci = !!process.env.CI;
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

export default defineConfig({
  testDir: 'tests/browser',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  fullyParallel: false,
  retries: 0, // flakes are fixed, never retried
  timeout: 240_000,
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
