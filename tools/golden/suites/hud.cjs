'use strict';
// G2e HUD draw-op goldens: the HUD canvas's calls (text, paths, rectangles, styles, transforms, with a synthetic text
// metric) hashed per drawn frame, at 1920x1080 and 2560x1440: every 25th frame of 20 s of the missile drill and of the
// full match (scripted as in the session goldens), then fixed states drawn one by one (views, free look, low health,
// low fuel, the vendor hint on the helipad) over a live helicopter in a running session (the recording refuses fixed
// states where the cockpit and the free-look view draw the same HUD). Pixel hashes are not used: font rasterisation
// differs by platform. textHex and fixedText (the words) are strict except in a declared wording step.
const { createPage } = require('../harness.cjs');
const { Hasher } = require('../canon.cjs');
const { SCENARIOS, SCRIPTS, Pilot } = require('../scenarios.cjs');
const { readDefaults, buildSettings } = require('./sessions.cjs');

const SIZES = [[1920, 1080], [2560, 1440]], FRAMES = 2000, EVERY = 25;
async function hudRun(rt, id, [w, hgt], settings, bindings, recording) {
  const sc = SCENARIOS[id], storage = { 'littlebird-range-v1': JSON.stringify({ version: 1, tuningRevision: 16, settings, bindings }) };
  const page = await createPage(rt, { seedG: sc.seedG, seedT: 160, storage, hash: '#carte=' + sc.map, width: w, height: hgt });
  const digests = [], texts = [], fixedText = {}; let frame = 0; const STOP = Symbol('stop');
  const tick = async () => { if (frame >= FRAMES) throw STOP; frame++; const rec = frame % EVERY === 0, h = rec ? new Hasher() : null, th = rec ? new Hasher() : null; if (rec) page.hudSink(h, th); await page.frame(); if (rec) { page.hudSink(null); digests.push(h.digest().slice(0, 16)); texts.push(th.digest().slice(0, 16)); } };
  let fixedKey = null; const draw = () => { const h = new Hasher(), th = new Hasher(); page.hudSink(h, th); page.app.updateCamera(); page.app.drawHud(); page.hudSink(null); if (fixedKey) fixedText[fixedKey] = th.digest().slice(0, 16); return h.digest().slice(0, 16); };
  const fixed = {}; const at = (k, fn) => { fixedKey = k; fixed[k] = fn ? fn() : draw(); fixedKey = null; };
  at('menu');
  await page.click('start');
  try { await SCRIPTS[id](new Pilot(page, tick)); } catch (e) { if (e !== STOP) throw e; }
  // A session in play and a live helicopter under the fixed states (frames past the budget, not recorded).
  if (!page.el('results').classList.contains('hidden')) await page.click('retry');
  for (let i = 0; i < 600 && !page.app.heliAlive; i++) await page.frame();
  const extra = { aliveBeforeFixed: page.app.heliAlive, runningBeforeFixed: page.app.running };
  const a = page.app, f = a.flight;
  f.position.set(0, 150, -400); f.velocity.set(0, 0, -40); f.quaternion.setFromEuler(new page.window.THREE.Euler(-.1, .6, .2, 'YXZ'));
  a.setView('cockpit'); at('cockpit'); a.setView('chase'); at('chase'); a.setView('cockpit');
  a.setLook(.8, -.2); at('freeLook'); a.setLook(0, 0);
  a.health = 30; at('lowHealth'); a.fuel = .08; at('lowFuel'); a.health = 100; a.fuel = 1;
  const W = page.window.HeliWorld; f.position.set(W.PAD.x, a.flight.ground(W.PAD.x, W.PAD.z) + 1.25, W.PAD.z); f.velocity.set(0, 0, 0); f.quaternion.identity(); f.onGround = true; at('onPad');
  if (recording && (!extra.aliveBeforeFixed || !extra.runningBeforeFixed || fixed.cockpit === fixed.freeLook)) throw Error(`hud ${id}: fixed states not drawn over a live helicopter in play (${JSON.stringify(extra)}, cockpit ${fixed.cockpit}, freeLook ${fixed.freeLook})`);
  return { frames: frame, every: EVERY, digestHex: digests.join(''), fixed, ...extra, hudOps: page.hudOps(), textHex: texts.join(''), fixedText };
}
async function record(rt, { golden = null, log = () => {} } = {}) {
  const d = golden ? null : await readDefaults(rt), runs = {};
  for (const id of ['missiles', 'match']) for (const size of SIZES) {
    const key = `${id}@${size.join('x')}`, settings = golden ? golden.meta.settings[id] : buildSettings(d, id), bindings = golden ? golden.meta.bindings : d.bindings;
    runs[key] = await hudRun(rt, id, size, settings, bindings, !golden); log('hud', key, runs[key].digestHex.slice(0, 16));
  }
  return { suite: 'hud', meta: { sizes: SIZES, frames: FRAMES, every: EVERY, textMetric: 'synthetic (chosen): width = font px x (3 + 0.55 x digits); texts reduced to their signed numbers in the strict draw log, the words in textHex/fixedText (strict except in a declared wording step)', settings: golden ? golden.meta.settings : { missiles: buildSettings(d, 'missiles'), match: buildSettings(d, 'match') }, bindings: golden ? golden.meta.bindings : d.bindings }, runs };
}
module.exports = { record };
