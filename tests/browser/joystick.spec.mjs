// Joysticks in Chrome (phase J3), with emulated pads only. Under WebDriver the page answers navigator.getGamepads with
// its own emulation, which returns the pads a test puts into window.__LB_EMULATED_GAMEPADS__; the fixture also traps the
// browser's real getGamepads before any page script and requires zero calls after each test, so the machine's
// joysticks are never read. Pad ids are public product identifiers (the vJoy virtual device); the game settings file is
// the repository's synthetic sample. Frames at 100 Hz (manual clock); each test renders a few dozen frames at most (CI
// scope, no @gpu tag).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, openTrainer, start, frames, diag, PROFILE_KEY } from './fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SAMPLE = path.join(ROOT, 'tests', 'fixtures', 'synthetic', 'joystick-settings.sample.txt');
const VJOY_ID = 'vJoy Device (Vendor: 1234 Product: bead)';
const HAT_CENTRED = 9 / 7;

// An emulated pad in slot `index` (zero-initialised: it has not reported yet).
const plug = (page, index, id = VJOY_ID) =>
  page.evaluate(
    ({ index, id }) => {
      const pad = {
        index,
        id,
        mapping: '',
        connected: true,
        timestamp: 1,
        axes: Array(10).fill(0),
        buttons: Array.from({ length: 32 }, () => ({ pressed: false, touched: false, value: 0 })),
      };
      window.__LB_EMULATED_GAMEPADS__.push(pad);
    },
    { index, id },
  );
// The pad sends a report: axes and buttons as given, its timestamp moves on.
const report = (page, index, { axes = {}, press = [], release = [] } = {}) =>
  page.evaluate(
    ({ index, axes, press, release }) => {
      const pad = window.__LB_EMULATED_GAMEPADS__.find((p) => p.index === index);
      for (const [i, v] of Object.entries(axes)) pad.axes[Number(i)] = v;
      for (const i of press) pad.buttons[i] = { pressed: true, touched: true, value: 1 };
      for (const i of release) pad.buttons[i] = { pressed: false, touched: false, value: 0 };
      pad.timestamp += 4;
    },
    { index, axes, press, release },
  );
const unplugAll = (page) => page.evaluate(() => (window.__LB_EMULATED_GAMEPADS__.length = 0));

// A neutral joystick block: HOTAS on, pitch and roll on the main device (the vJoy device when none is named).
const bound = (device, axis) => ({
  device,
  axis,
  invert: false,
  sensitivity: 1,
  deadZone: 0.05,
  positive: null,
  negative: null,
});
const JOYSTICK = {
  schema: 1,
  useHotas: true,
  deviceMatch: 'role',
  confirmRoles: true,
  devices: { main: null, left: null, right: null },
  axes: {
    Pitch: bound('main', 1),
    Throttle: bound(null, 2),
    Roll: bound('main', 0),
    Yaw: bound(null, 5),
    LookYaw: bound(null, -1),
    LookPitch: bound(null, -1),
  },
  actions: { fire: [{ device: 'main', button: 0 }] },
};

test('getGamepads is the page emulation under WebDriver, before any read; nothing is read until asked', async ({
  page,
}) => {
  await openTrainer(page, { manualClock: true });
  const shim = await page.evaluate(() => {
    const d = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
    return {
      own: !!d,
      writable: d ? d.writable : null,
      notTheBrowsers: navigator.getGamepads !== Navigator.prototype.getGamepads,
      list: Array.isArray(window.__LB_EMULATED_GAMEPADS__),
      empty: navigator.getGamepads().length === 0,
    };
  });
  expect(shim).toEqual({ own: true, writable: false, notTheBrowsers: true, list: true, empty: true });
  await frames(page, 10);
  await expect(page.locator('#joyStatus')).toHaveText('Lecture arrêtée.');
  await expect(page.locator('#joyUseHotas')).not.toBeChecked();
});

test('the joystick panel lists an emulated vJoy device, its axes and buttons; « Lire les manettes » starts and stops', async ({
  page,
}) => {
  await openTrainer(page, { manualClock: true });
  await page.locator('[data-tab="controls"]').click();
  await plug(page, 0);
  await page.locator('#joyRead').click();
  await frames(page, 6);
  await expect(page.locator('#joyRead')).toHaveText('Arrêter la lecture');
  await report(page, 0, { axes: { 1: 0.5, 9: HAT_CENTRED }, press: [2] });
  await frames(page, 12);
  const row = page.locator('#joyDevices .joy-device').first();
  await expect(row).toContainText('vJoy Device · 1234:BEAD · virtuelle (vJoy) · manette principale · reçoit');
  await expect(row).toContainText('1 +0,50');
  await expect(row).toContainText('Boutons appuyés (numéros du jeu, à partir de 0) : 2');
  await page.locator('#joyRead').click();
  await expect(page.locator('#joyStatus')).toHaveText('Lecture arrêtée.');
  await expect(page.locator('#joyDevices .joy-device')).toHaveCount(0);
});

test('import of the game joystick section (synthetic file): a preview, then the profile mirrors it', async ({
  page,
}) => {
  await openTrainer(page, { manualClock: true });
  await page.locator('[data-tab="controls"]').click();
  await page.locator('#importJoystick').setInputFiles(SAMPLE);
  const preview = page.locator('#joyPreview');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('HOTAS dans le jeu : activé');
  await expect(preview).toContainText('Tangage : vJoy Device (1234:BEAD), axe 1, sensibilité 0,8, zone morte 0,1.');
  await expect(preview).toContainText('lus par leur position');
  await preview.locator('.actions button').first().click();
  await expect(preview).toBeHidden();
  await expect(page.locator('#toast')).toContainText('appliquée : HOTAS activé, 4 axes et 3 boutons liés');
  await expect(page.locator('#joyUseHotas')).toBeChecked();
  await expect(page.locator('#joyPitchAxis')).toHaveValue('1');
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).joystick, PROFILE_KEY);
  expect([saved.schema, saved.useHotas, saved.devices.main.product, saved.axes.Pitch.device]).toEqual([
    1,
    true,
    'bead',
    'main',
  ]);
});

test('HOTAS on: an emulated vJoy stick pitches the helicopter; unplugged in flight, the session pauses', async ({
  page,
}) => {
  await openTrainer(page, {
    manualClock: true,
    profile: { version: 1, tuningRevision: 16, settings: { scenario: 'free' }, bindings: {}, joystick: JOYSTICK },
  });
  await expect(page.locator('#joyUseHotas')).toBeChecked();
  await plug(page, 0);
  await start(page);
  // In the air, level and still (the free mode starts on the helipad). The manual clock starts at the page's own time:
  // the page measured its last frame time at load, so a clock behind it would hold the physics back for seconds.
  await page.evaluate(() => {
    window.__lbClock = Math.ceil(performance.now());
    const f = window.__app.flight;
    f.position.set(0, 400, -300);
    f.velocity.set(0, 0, 0);
    f.onGround = false;
  });
  // The first reads only see the pad (it has not reported yet: held); its next report makes it live.
  await frames(page, 2);
  await report(page, 0, { axes: { 1: 1, 9: HAT_CENTRED } });
  await frames(page, 40);
  const pitchRate = await page.evaluate(() => window.__app.flight.angular.x);
  expect(pitchRate, 'full deflection pitches the nose up').toBeGreaterThan(0.2);
  await unplugAll(page);
  await frames(page, 2);
  expect((await diag(page)).running).toBe(false);
  await expect(page.locator('#toast')).toContainText('Manette principale débranchée : session en pause');
});
