'use strict';
// G2c world goldens and G2g boot-scene digests: the reference valley and 10 generated maps (their gen-N codes must keep
// giving the same map, since players share them as #carte=gen-N links). Each map is loaded as a page (graphics 'high',
// no session): map tables of world.js, terrain height / forest density / reserved-ground grids, the forest's tree
// arrays, the obstacle field, towers and wires, 400 seeded line-of-sight queries through the obstacle field (forest
// layer included), the boot scene digest, the cockpit model digest, and every texture canvas's draw log.
const { createPage } = require('../harness.cjs');
const { Hasher } = require('../canon.cjs');
const { sceneDigest, canvasDigests } = require('../scene.cjs');

const MAPS = ['vallee', 'gen-1', 'gen-2', 'gen-7', 'gen-42', 'gen-77', 'gen-1234', 'gen-4242', 'gen-65536', 'gen-424242', 'gen-999998'];
const lcg = seed => { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const typed = (h, a) => { h.str(a.constructor.name).num(a.length); h.bytes(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); };

function worldTables(h, W) { for (const k of Object.keys(W).sort()) { const v = W[k]; if (typeof v === 'function') continue; h.str(k); h.val(v); } }
function grids(W) {
  const g = { height: new Hasher(), forest: new Hasher(), reserved: new Hasher() };
  for (let z = -3400; z <= 800; z += 25) for (let x = -2200; x <= 2200; x += 25) g.height.num(W.height(x, z));
  for (let z = -3400; z <= 800; z += 50) for (let x = -2200; x <= 2200; x += 50) { g.forest.num(W.forestDensity(x, z)); g.reserved.bool(!!W.reserved(x, z)); }
  return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.digest()]));
}
async function mapGolden(rt, id, defaultsStorage, { hash = '#carte=' + id, seedG = 1 } = {}) {
  const page = await createPage(rt, { seedG, seedT: 160, hash, audio: false, storage: defaultsStorage });
  const app = page.app, W = page.window.HeliWorld, T = page.window.THREE, sc = app.scenery;
  if (id && W.id !== id) throw Error('map ' + id + ' not loaded (got ' + W.id + ')');
  id = W.id;
  const tables = new Hasher(); worldTables(tables, W);
  const forest = new Hasher(), fo = sc.forest; forest.num(fo.count).val(fo.perSpecies); for (const a of [fo.x, fo.y, fo.z, fo.heights, fo.species]) typed(forest, a); forest.num(fo.bushes ? fo.bushes.count : -1);
  const obstacles = new Hasher(); obstacles.num(app.obstacles.items.length); for (const o of app.obstacles.items) { obstacles.val([o.min, o.max, o.kind]); }
  const towers = new Hasher(); for (const t of app.towers) { for (const k of Object.keys(t).sort()) { const v = t[k]; if (v === null || ['number', 'string', 'boolean'].includes(typeof v) || v && (v.isVector3)) { towers.str(k).val(v); } } } towers.num(app.wires.length); for (const w of app.wires) towers.val([w.a, w.b]);
  // Line-of-sight and collision queries (seeded segments inside the play area).
  const los = new Hasher(), r = lcg(7 + id.length);
  for (let i = 0; i < 400; i++) {
    const a = new T.Vector3(-1800 + 3600 * r(), 0, -3000 + 3500 * r()), b = new T.Vector3(a.x + (r() - .5) * 600, 0, a.z + (r() - .5) * 600);
    a.y = W.height(a.x, a.z) + 2 + r() * 60; b.y = W.height(b.x, b.z) + 2 + r() * 60;
    const hit = app.obstacles.hit(a, b, i % 3 ? 0 : 1.5); los.val(hit ? [hit.fraction, hit.kind] : null);
  }
  const scene = sceneDigest(app.scene, T), cockpit = sceneDigest(app.cockpit.group, T);
  return { id, name: new Hasher().str(W.name).digest().slice(0, 16), generated: W.generated, seed: W.seed, tables: tables.digest(), grids: grids(W), forest: forest.digest(), obstacles: obstacles.digest(),
    towersWires: towers.digest(), los: los.digest(), counts: { trees: fo.count, obstacles: app.obstacles.items.length, towers: app.towers.length, wires: app.wires.length, houses: W.HOUSES.length, fields: W.FIELDS.length, aaSites: W.AA_SITES.length },
    scene: scene.digest, sceneCounts: scene.counts, cockpit: cockpit.digest, canvases: canvasDigests(page.document), bootDraws: { game: page.counters.gameDraws, three: page.counters.threeDraws } };
}
// Other boots: the valley at the other graphics levels (the scenery and forest depend on it), and the page load with
// the menu's "new generated map at every load" (mapRandomEach): the map drawn from stream G at boot, over the address.
const BOOTS = [
  { key: 'vallee@medium', id: 'vallee', graphics: 'medium' }, { key: 'vallee@low', id: 'vallee', graphics: 'low' },
  { key: 'random-each', id: null, graphics: 'high', seedG: 5, hash: '#carte=vallee', map: { id: 'vallee', random: true }, mapRandomEach: true }
];
async function record(rt, { golden = null, log = () => {} } = {}) {
  // The page boots with a profile giving the same graphics quality everywhere (the scenery depends on it).
  const profile = (graphics, extra = {}) => JSON.stringify({ version: 1, tuningRevision: 16, settings: { graphics, lighting: 'random', ...extra }, bindings: {} });
  const storage = { 'littlebird-range-v1': profile('high') };
  const maps = {};
  for (const id of MAPS) { maps[id] = await mapGolden(rt, id, storage); log('world', id, maps[id].scene.slice(0, 16), maps[id].counts.trees); }
  const boots = {};
  for (const b of BOOTS) {
    const st = { 'littlebird-range-v1': profile(b.graphics, b.mapRandomEach ? { mapRandomEach: true } : {}) }; if (b.map) st['littlebird-map'] = JSON.stringify(b.map);
    boots[b.key] = await mapGolden(rt, b.id, st, { hash: b.hash, seedG: b.seedG }); log('world', b.key, boots[b.key].id, boots[b.key].scene.slice(0, 16), boots[b.key].counts.trees);
  }
  if (!golden && !(boots['random-each'].generated && boots['random-each'].id !== 'vallee')) throw Error('world: the mapRandomEach boot did not generate a map');
  return { suite: 'world', meta: { maps: MAPS, boots: BOOTS, grid: { height: '25 m, x -2200..2200, z -3400..800', density: '50 m' }, losQueries: 400, bootProfile: { graphics: 'high', lighting: 'random' } }, maps, boots };
}
module.exports = { record, MAPS };
