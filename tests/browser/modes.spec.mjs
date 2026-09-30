// Game modes in a real browser, frames at 100 Hz (manual clock): the cabin mix of the pilot view (check F23), the
// range against a static target, the surface-to-air drill (a Verba gunner locks, the lock tone, the missile leaves his
// tube, flares), the full match with its resupply on the helipad, and the duels against minigun and rocket bots.
import {
  test,
  expect,
  openTrainer,
  diag,
  start,
  seconds,
  hold,
  until,
  leave,
  audioSettled,
  keyFor,
} from './fixtures.mjs';
import NAMES from '../helpers/names.js';

test('F23 cabin mix in the pilot view: highs shelved below -7 dB above 4.5 kHz, rotor bus above x1.8; the chase view plain @gpu', async ({
  page,
}) => {
  await openTrainer(page, { manualClock: true });
  await page.locator('[data-mode="free"]').click();
  await start(page);
  await hold(page, await keyFor(page, 'collectiveUp'), 1);
  await seconds(page, 3);
  // The mix moves along Web Audio ramps, which follow the audio clock (real time), not the test's frame clock: the
  // values are read once the ramp has settled (at most 10 s of real time).
  const settled = (pred) => audioSettled(page, pred);
  let ok = await settled(() => {
    const a = trainerDiagnostics().audio;
    return a.cabinShelfDb < -7 && a.engineBus > 1.8;
  });
  let a = (await diag(page)).audio;
  expect(ok, `pilot view: ${a.cabinShelfDb} dB, x${a.engineBus}`).toBe(true);
  await page.keyboard.press(await keyFor(page, 'view'));
  await seconds(page, 0.6);
  expect((await diag(page)).view).toBe('chase');
  ok = await settled(() => {
    const a = trainerDiagnostics().audio;
    return a.cabinShelfDb > -1 && a.engineBus < 1.1;
  });
  a = (await diag(page)).audio;
  expect(ok, `chase view: ${a.cabinShelfDb} dB, x${a.engineBus}`).toBe(true);
  await leave(page);
});

test('range: a static air target is hit by a 2.5 s burst (8 hits or more) @gpu', async ({ page }) => {
  await openTrainer(page, { manualClock: true });
  await page.locator('[data-mode="range"]').click();
  await page.locator('[data-scenario="air"]').click();
  await page.selectOption('#trajectory', 'static');
  await page.locator('#targetCount').fill('1');
  await page.locator('#targetCount').dispatchEvent('input');
  await start(page);
  await hold(page, await keyFor(page, 'fire'), 2.5);
  await seconds(page, 0.6);
  const s = await diag(page);
  expect(s.stats.hits, 'hits on a static target').toBeGreaterThanOrEqual(8);
  await leave(page);
});

test('surface-to-air drill: a Verba gunner locks with a steady tone, the missile leaves his tube, flares at about 1.5 s to go @gpu', async ({
  page,
}) => {
  await openTrainer(page, { manualClock: true });
  await page.locator('[data-mode="missiles"]').click();
  await page.selectOption('#duration', '0');
  await page.locator('#aaLaunchers').fill('4');
  await page.locator('#aaLaunchers').dispatchEvent('input');
  await start(page);
  let s = await diag(page);
  expect(s.air.launchers.length).toBe(4);
  expect(
    s.air.launchers.every((l) => l.unit === 'verba' || l.unit === NAMES.samUnitTag),
    'gunners or emplacements',
  ).toBe(true);
  // Repeatable engagement: one brave gunner 460 m north of the helipad, in the open.
  await page.evaluate(() => {
    __app.resetAir();
    __app.defense.grace = 1;
    const l = __app.addVerba(0, -330, null, { home: true, ammo: 3 });
    l.unit.soldier.brave = true;
  });
  await hold(page, await keyFor(page, 'collectiveUp'), 2.2);
  expect(
    await until(
      page,
      () => trainerDiagnostics().battle.soldiers.some((q) => q.role === 'verba' && q.state === 'engage'),
      30,
    ),
    'the gunner engages',
  ).not.toBeNull();
  expect(await until(page, () => trainerDiagnostics().air.warning === 2, 60, null, 2), 'lock tone').not.toBeNull();
  await seconds(page, 0.15);
  expect(await audioSettled(page, () => trainerDiagnostics().audio.lockGain > 0.03), 'steady lock tone playing').toBe(
    true,
  );
  expect(
    await until(page, () => trainerDiagnostics().air.missiles.length > 0, 20, null, 1),
    'missile launched',
  ).not.toBeNull();
  s = await diag(page);
  const g = s.battle.soldiers.find((q) => q.role === 'verba');
  const m = s.air.missiles[0].position;
  expect(
    Math.hypot(m[0] - g.position[0], m[1] - g.position[1] - 1.5, m[2] - g.position[2]),
    'the missile leaves the gunner',
  ).toBeLessThan(40);
  const near = () => {
    const d = trainerDiagnostics();
    const p = d.position;
    return (
      d.air.missiles.some(
        (q) =>
          q.target === 'heli' &&
          Math.hypot(p[0] - q.position[0], p[1] - q.position[1], p[2] - q.position[2]) < d.run.aaMissileSpeed * 1.5,
      ) || !d.heliAlive
    );
  };
  expect(await until(page, near, 30, null, 1), 'missile 1.5 s away').not.toBeNull();
  await page.keyboard.press(await keyFor(page, 'flares'));
  await seconds(page, 0.25);
  s = await diag(page);
  expect(s.air.charges).toBe(1);
  expect(s.air.flares).toBeGreaterThanOrEqual(4);
  const outcome = () => {
    const a = trainerDiagnostics().air.stats;
    return a.hits + a.grazes + a.dodged.flare + a.dodged.terrain + a.dodged.maneuver + a.dodged.clutter >= 1;
  };
  expect(await until(page, outcome, 20), 'the engagement ends').not.toBeNull();
  await leave(page);
});

test('full match: camps, hot zone and 300 rounds; land on the helipad and resupply with B (boxes of 150 rounds, flares) @gpu', async ({
  page,
}) => {
  await openTrainer(page, { manualClock: true });
  await page.locator('[data-mode="match"]').click();
  await page.selectOption('#difficulty', 'easy');
  await start(page);
  let s = await diag(page);
  expect(s.mode).toBe('match');
  expect(s.hot && s.battle.structures.length > 0 && s.ammo === 300).toBe(true);
  await page.keyboard.press(await keyFor(page, 'view'));
  await seconds(page, 0.5);
  await hold(page, await keyFor(page, 'fire'), 1.2);
  s = await diag(page);
  expect(s.ammo, 'ammunition used').toBeLessThan(300);
  const used = s.ammo;
  // The descent to the pad is not the subject: the enemy air defence and helicopters hold their fire meanwhile.
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
  s = await diag(page);
  expect(s.heliAlive && s.onGround).toBe(true);
  await page.keyboard.press(await keyFor(page, 'shop'));
  await seconds(page, 0.3);
  expect(await page.locator('#shop').isVisible(), 'resupply screen').toBe(true);
  await page.locator('[data-item="ammo"]').click();
  await page.locator('[data-item="flare"]').click();
  s = await diag(page);
  expect(s.ammo, 'a box of 150 added').toBeGreaterThan(used);
  await page.locator('#shopClose').click();
  await page.waitForFunction(() => trainerDiagnostics().running && !trainerDiagnostics().shopOpen);
  await leave(page);
});

test('duel against two minigun bots: they come from 1.3 km, fire, are heard, and hit the helicopter @gpu', async ({
  page,
}) => {
  await openTrainer(page, { manualClock: true });
  await page.locator('[data-mode="duel"]').click();
  await page.selectOption('#difficulty', 'normal');
  await page.selectOption('#duration', '0');
  await page.locator('#duelBots').fill('2');
  await page.locator('#duelBots').dispatchEvent('input');
  await start(page);
  let s = await diag(page);
  expect(s.mode).toBe('duel');
  expect(s.bots.length).toBe(2);
  expect(
    s.bots.every((b) => b.active && b.distance > 1100),
    'bots far ahead',
  ).toBe(true);
  await hold(page, await keyFor(page, 'collectiveUp'), 1.5);
  expect(
    await until(page, () => trainerDiagnostics().duel.enemyShots > 0 || !trainerDiagnostics().heliAlive, 60),
    'the bots fire',
  ).not.toBeNull();
  s = await diag(page);
  expect(s.audio.enemyVoices, 'enemy voices').toBeGreaterThanOrEqual(2);
  await seconds(page, 0.4);
  expect(await audioSettled(page, () => trainerDiagnostics().audio.enemyRotor > 0), 'enemy rotor heard').toBe(true);
  const hit = () => {
    const d = trainerDiagnostics();
    return d.duel.hitsTaken > 0 || !d.heliAlive || d.stats.deaths > 0;
  };
  expect(await until(page, hit, 60), 'enemy rounds hit').not.toBeNull();
  await leave(page);
});

test('duel against an AH-6R: a pod of 8 rockets, fired in salvos @gpu', async ({ page }) => {
  await openTrainer(page, { manualClock: true });
  await page.locator('[data-mode="duel"]').click();
  await page.locator('#duelBots').fill('1');
  await page.locator('#duelBots').dispatchEvent('input');
  await page.selectOption('#duelEnemy', 'ah6r');
  await start(page);
  let s = await diag(page);
  expect(s.bots[0].weapon).toBe('rockets');
  expect(s.bots[0].rockets).toBe(8);
  await hold(page, await keyFor(page, 'collectiveUp'), 1.5);
  expect(
    await until(page, () => trainerDiagnostics().bots[0].shots >= 2 || !trainerDiagnostics().heliAlive, 90),
    'rockets fired',
  ).not.toBeNull();
  s = await diag(page);
  expect(s.bots[0].shots, 'the AH-6R fired its rockets').toBeGreaterThanOrEqual(2);
  await leave(page);
});
