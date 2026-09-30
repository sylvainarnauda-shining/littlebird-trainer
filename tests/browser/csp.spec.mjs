// G-CSP: the built page under its own Content-Security-Policy in a real browser. The meta policy is the one written
// beside the page (csp.txt); then every screen and mode runs with zero `securitypolicyviolation` event and zero console
// error: the menu tabs and the flight-model panel, WebGL2 drawing, the sound engine, the emulated pointer lock (asserted
// before each Start), the seven modes, the pause and resupply screens, the results, both imports (a profile and a game
// settings file) and the export (a blob download). Frames at 100 Hz (manual clock).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, openTrainer, diag, start, seconds, hold, until, leave, keyFor } from './fixtures.mjs';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'web');
const SETTINGS_FILE = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'synthetic', 'game-settings.sample.txt'),
);

function recordViolations() {
  const list = [];
  Object.defineProperty(window, '__cspViolations', { value: list });
  document.addEventListener('securitypolicyviolation', (e) =>
    list.push({ directive: e.violatedDirective, blocked: e.blockedURI, sample: e.sample }),
  );
}

test('the page runs every screen and mode under its CSP: no violation, no console error', async ({
  page,
}, testInfo) => {
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await page.addInitScript(recordViolations);
  await openTrainer(page, { manualClock: true });

  // The policy in force is the build's.
  const policy = fs.readFileSync(path.join(WEB, 'csp.txt'), 'utf8').trim();
  const meta = await page.evaluate(() =>
    [...document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')].map((m) => m.content),
  );
  expect(meta).toEqual([policy]);
  expect(policy).toMatch(/^default-src 'none'; script-src ('sha256-[A-Za-z0-9+/]+=*' ?){13}; style-src 'sha256-/);

  // WebGL2 draws; the menu tabs and panels.
  await seconds(page, 0.2);
  expect((await diag(page)).webgl.calls, 'WebGL draw calls').toBeGreaterThan(0);
  for (const tab of ['controls', 'settings', 'modes']) {
    await page.locator(`[data-tab="${tab}"]`).click();
    if (tab === 'settings') await page.locator('.flight-tuning summary').click();
  }

  // Both imports and the export.
  await page.locator('[data-tab="controls"]').click();
  await page.locator('#importGame').setInputFiles({
    name: 'GameUserSettings.ini',
    mimeType: 'text/plain',
    buffer: SETTINGS_FILE,
  });
  await page.waitForFunction(() => document.getElementById('toast').textContent.length > 0);
  expect((await diag(page)).settings.pitchSens, 'settings file read').toBe(35);
  await page.locator('[data-tab="settings"]').click();
  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  const saved = testInfo.outputPath('profil.json');
  await (await download).saveAs(saved);
  const exported = JSON.parse(fs.readFileSync(saved, 'utf8'));
  expect(exported.format).toBe('littlebird-trainer-profile');
  await page.locator('#defaults').click();
  await page.locator('#import').setInputFiles(saved);
  await page.waitForFunction(() => trainerDiagnostics().settings.pitchSens === 35);
  await page.locator('[data-tab="modes"]').click();

  // Every mode: start through the emulated lock, fly a little, leave through the pause screen.
  for (const mode of ['range', 'assault', 'missiles', 'match', 'towers', 'free', 'duel']) {
    await page.locator(`[data-mode="${mode}"]`).click();
    await start(page);
    if (mode === 'match') {
      // Down to the helipad (the enemy holds its fire meanwhile), then the resupply screen.
      await page.evaluate(() => {
        __app.defense.grace = 1e9;
        for (const t of __app.bots) {
          t.active = false;
          t.respawn = 1e9;
        }
      });
      const down = await keyFor(page, 'collectiveDown');
      await page.keyboard.down(down);
      expect(await until(page, () => trainerDiagnostics().onGround, 40), 'landed').not.toBeNull();
      await page.keyboard.up(down);
      await seconds(page, 0.5);
      await page.keyboard.press(await keyFor(page, 'shop'));
      await seconds(page, 0.3);
      expect(await page.locator('#shop').isVisible(), 'resupply screen').toBe(true);
      await page.locator('#shopClose').click();
      await page.waitForFunction(() => trainerDiagnostics().running && !trainerDiagnostics().shopOpen);
    }
    await hold(page, await keyFor(page, 'collectiveUp'), 0.8);
    await hold(page, await keyFor(page, 'fire'), 0.5);
    await seconds(page, 1);
    const s = await diag(page);
    expect(s.running, mode + ' running').toBe(true);
    expect(s.audio.state, mode + ': sound engine').toBe('running');
    await leave(page);
    expect(await page.locator('#pause').isVisible(), mode + ': pause screen').toBe(true);
    await page.locator('#pauseModes').click();
  }

  // The results screen.
  await page.locator('[data-mode="free"]').click();
  await start(page);
  await seconds(page, 0.5);
  await page.evaluate(() => __app.finish('time'));
  await seconds(page, 0.2);
  expect(await page.locator('#results').isVisible(), 'results screen').toBe(true);

  const violations = await page.evaluate(() => window.__cspViolations);
  expect(violations, 'no securitypolicyviolation').toEqual([]);
  expect(consoleErrors, 'no console error').toEqual([]);

  // Control: the policy is enforced and the recorder sees it. An inline script added at run time is refused.
  const refused = await page.evaluate(async () => {
    window.__cspRan = false;
    const s = document.createElement('script');
    s.textContent = 'window.__cspRan = true;';
    document.head.appendChild(s);
    await new Promise((r) => setTimeout(r, 100));
    return { ran: window.__cspRan, directives: window.__cspViolations.map((v) => v.directive) };
  });
  expect(refused.ran, 'the injected script did not run').toBe(false);
  expect(refused.directives).toEqual(['script-src-elem']);
});
