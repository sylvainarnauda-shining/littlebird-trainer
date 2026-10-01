'use strict';
// The joystick golden suite drives the panel by one of two paths (panel() in tools/golden/suites/joystick.cjs): the hooks the
// page exposes, or, on a runtime that has only the panel (the baseline that golden.mjs prove records), the ids of its controls.
// Each runtime records by one path, so the goldens cannot show that the two agree. This test drives the same steps through both
// on the current page and compares what they leave: the devices listed, the preview, the stored profile and the notices. It goes
// with the panel's ids (phase M8 removes them).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { RECORDER, SRC, TEMPLATE } = require('../helpers/paths');

const { loadRuntime, createPage } = require(path.join(RECORDER, 'harness.cjs'));
const { panel, Stick, gameSection, VJOY_ID } = require(path.join(RECORDER, 'suites', 'joystick.cjs'));

const STORE = 'littlebird-range-v1';
const SECTION = gameSection({
  axes: { Pitch: { axis: 1, sensitivity: 0.8 }, Roll: { axis: 0 } },
  actions: [['Fire', 3]],
});
const rt = loadRuntime({ src: SRC, template: TEMPLATE });

async function drive(viaIds) {
  const page = await createPage(rt, { audio: false, gamepads: [new Stick(0, VJOY_ID).pad] });
  const joy = panel(page, viaIds);
  const out = {};
  await joy.read(true);
  await page.advance(60);
  out.listed = [joy.devices().length, /vJoy Device/.test(joy.devices().join(' '))];
  await joy.read(false);
  out.listedAfterStop = joy.devices().length;
  await joy.hotas(true);
  out.hotasNotice = page.toast();
  await joy.axisDevice('Pitch', 'main');
  out.afterDevice = page.storage.get(STORE);
  await joy.axisDevice('Pitch', 'nowhere');
  out.afterUnknownDevice = page.storage.get(STORE);
  await joy.importFile(SECTION);
  out.preview = joy.preview();
  await joy.cancel();
  out.afterCancel = [joy.preview(), page.storage.get(STORE)];
  await joy.importFile(SECTION);
  await joy.apply();
  out.afterApply = [joy.preview(), page.storage.get(STORE), page.toast()];
  await joy.importFile('[x]\ny=1\n');
  out.refused = [joy.preview(), page.toast()];
  return JSON.parse(JSON.stringify(out)); // the hooks' objects come from the page's own realm
}

test('the hooks and the ids of the panel leave the same devices, preview, profile and notices', async () => {
  const hooks = await drive(false);
  assert.deepEqual(hooks.listed, [1, true]);
  assert.equal(hooks.listedAfterStop, 0);
  assert.match(hooks.hotasNotice, /^HOTAS activé/);
  assert.notEqual(hooks.afterDevice, hooks.afterUnknownDevice, 'an unknown device unbinds the axis');
  assert.ok(hooks.preview.rows > 4 && hooks.preview.text.includes('Tangage'));
  assert.equal(hooks.afterCancel[0], null);
  assert.equal(hooks.afterCancel[1], hooks.afterUnknownDevice, 'cancel changes nothing');
  assert.equal(hooks.afterApply[0], null);
  assert.match(hooks.afterApply[2], /appliquée : HOTAS activé, 2 axes et 1 boutons liés/);
  assert.equal(hooks.refused[0], null);
  assert.match(hooks.refused[1], /^Import refusé : aucune configuration joystick/);
  assert.deepEqual(await drive(true), hooks);
});

test('the suite takes the hooks when the runtime has them all, the ids otherwise', () => {
  const names = ['joyReading', 'joyDevices', 'joyHotas', 'joyAxisDevice', 'joyImport', 'joyPreviewShown', 'joyApply'];
  const app = Object.fromEntries([...names, 'joyCancel'].map((k) => [k, () => 'hook']));
  const page = (hooks) => ({ app: hooks, el: () => ({ children: [{ textContent: 'ids' }] }) });
  assert.equal(panel(page(app)).devices(), 'hook');
  assert.deepEqual(panel(page(Object.fromEntries(names.map((k) => [k, app[k]])))).devices(), ['ids']);
  assert.deepEqual(panel(page({})).devices(), ['ids']);
});

test('Appliquer with no preview open does nothing, after a cancel too', async () => {
  const page = await createPage(rt, { audio: false });
  const joy = panel(page, false);
  await joy.apply();
  await joy.importFile(SECTION);
  await joy.cancel();
  await joy.apply();
  assert.equal(joy.preview(), null);
  assert.equal(page.storage.get(STORE), undefined, 'nothing was applied or saved');
});
