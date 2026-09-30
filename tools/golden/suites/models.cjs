'use strict';
// G2g model digests: every model variant models.js builds (own helicopter, air target, bots with both weapon kits,
// vehicles, infantry of each faction, the SAM and CIWS emplacements, every structure type, the cockpit), each as a
// scene-graph digest (scene.cjs) with its canvas textures, plus the paint and look tables. Colour and shape drift of
// the models shows here even when no session golden draws the model.
const { makeModuleRealm } = require('../harness.cjs');
const { Document } = require('../dom.cjs');
const { Hasher } = require('../canon.cjs');
const { sceneDigest } = require('../scene.cjs');
const { pick } = require('../runtime-names.cjs');

async function record(rt, { log = () => {} } = {}) {
  const realm = makeModuleRealm(rt, { files: ['world.js', 'physics.js', 'ground.js', 'models.js'], seedG: 3 }), T = realm.THREE;
  const doc = new Document('<html><body></body></html>', realm.g), canvas = (w, h) => { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c; };
  const m = realm.Models.create(T), out = {};
  // make() builds the model; the canvases it creates (textures) are hashed with it.
  const put = (k, make) => { const c0 = doc.canvases.length, view = make(), s = sceneDigest(view.group || view, T), h = new Hasher(), th = new Hasher(); h.str(s.digest);
    for (const c of doc.canvases.slice(c0)) { h.str(c.__hash ? c.__hash.peek() : '-'); th.str(c.__text ? c.__text.peek() : '-'); }
    out[k] = { digest: h.digest().slice(0, 32), counts: s.counts, canvases: doc.canvases.length - c0, text: th.digest().slice(0, 16) }; log('models', k, out[k].digest.slice(0, 16)); };
  put('own', () => m.helicopter(m.OWN_PAINT, { canvas }));
  put('air-target', () => m.helicopter('#af7850', { pilots: false, livery: true }));
  for (const [i, c] of ['#ddb07d', '#b0aa7d', '#ca9779'].entries()) put('bot-' + i + '-miniguns', () => m.helicopter(c, { weapons: 'miniguns', livery: true }));
  put('bot-rockets', () => m.helicopter('#ddb07d', { weapons: 'rockets', livery: true }));
  for (const k of ['truck', 'humvee', 'pickup']) put('vehicle-' + k, () => m.vehicle(k));
  Object.keys(m.FACTIONS).forEach((f, i) => put('infantry-' + i, () => m.defender(f)));
  put('sam-site', () => pick(m, 'samSiteModel').call(m)); put('ciws', () => m.ciws()); put('cockpit', () => m.cockpit(canvas));
  Object.keys(realm.G.TYPES).forEach((t, i) => put('structure-' + i, () => m.structure(t)));
  const tables = new Hasher(); tables.str(m.OWN_PAINT).val(m.LOOK).val(Object.keys(m.FACTIONS).map(k => m.FACTIONS[k])); tables.val(Object.keys(realm.G.TYPES).map(k => realm.G.TYPES[k]));
  return { suite: 'models', meta: { structures: Object.keys(realm.G.TYPES).length, factions: Object.keys(m.FACTIONS).length, threeDraws: realm.counters.threeDraws, gameDraws: realm.counters.gameDraws }, models: out, tables: tables.digest() };
}
module.exports = { record };
