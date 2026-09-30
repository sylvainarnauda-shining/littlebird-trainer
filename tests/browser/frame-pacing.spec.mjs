// Frame pacing in a real browser with GPU frames driven at exactly 10 ms (check F36 in the browser, M15): at a constant
// 250 km/h the per-frame displacement of the view varies by less than 2 % in both views while the raw 1/120 s physics
// states judder; the chase view is widened by 24 deg at that speed (measured: 85 to 109 deg on the recordings) and the
// pilot view keeps its set field of view.
import { test, expect, openTrainer, diag, start, frames, leave } from './fixtures.mjs';

test('100 Hz frames at 250 km/h: view displacement variation < 2 % (raw states > 30 %); chase widened by 24 deg, pilot fixed @gpu', async ({
  page,
}) => {
  await openTrainer(page, { manualClock: true });
  await page.locator('[data-mode="free"]').click();
  await page.selectOption('#duration', '0');
  await start(page);
  await frames(page, 20);
  const pacing = await page.evaluate(() => {
    const a = __app;
    const f = a.flight;
    const out = {};
    let t = window.__lbClock;
    const set = (kmh) => {
      f.position.set(0, 560, -400);
      f.velocity.set(0, 0, -kmh / 3.6);
      f.quaternion.setFromEuler(new THREE.Euler((-8.6 * Math.PI) / 180, 0, 0, 'YXZ'));
      f.angular.set(0, 0, 0);
      f.cyclic.set(0, 0, 0);
      f.mouseRate.set(0, 0, 0);
      f.collective = 0.5;
      f.onGround = false;
    };
    const cv = (x) => {
      const m = x.reduce((s, v) => s + v, 0) / x.length;
      return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / x.length) / m;
    };
    for (const view of ['chase', 'cockpit']) {
      a.setView(view);
      set(250);
      for (let i = 0; i < 120; i++) a.frame((t += 10));
      const cam = [];
      const raw = [];
      const pc = a.camera.position.clone();
      const pr = f.position.clone();
      for (let i = 0; i < 300; i++) {
        a.frame((t += 10));
        cam.push(a.camera.position.distanceTo(pc));
        raw.push(f.position.distanceTo(pr));
        pc.copy(a.camera.position);
        pr.copy(f.position);
      }
      out[view] = { cvCamera: cv(cam), cvRaw: cv(raw), fov: trainerDiagnostics().camera.fovHorizontal };
    }
    window.__lbClock = t;
    return out;
  });
  for (const k of ['chase', 'cockpit']) {
    expect(pacing[k].cvCamera < 0.02 && pacing[k].cvRaw > 0.3, `${k}: ${JSON.stringify(pacing[k])}`).toBe(true);
  }
  const s = (await diag(page)).settings;
  expect(Math.abs(pacing.chase.fov - (s.fovChase + 24)), 'chase view widened at 250 km/h').toBeLessThan(0.1);
  expect(pacing.cockpit.fov, 'pilot view fixed').toBe(s.fovCockpit);
  await leave(page);
});
