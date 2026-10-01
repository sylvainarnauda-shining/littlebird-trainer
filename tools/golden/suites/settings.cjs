'use strict';
// G2f settings oracle: what the current code makes of a profile or a game settings file, through the app's own import
// buttons (upgradedSettings, sanitize with the page's input ranges, validBindings) and through a page boot with the
// profile in storage. 10 000 seeded profiles (valid, out of range, wrong types, JSON-hostile values such as -0, 1e308,
// "constructor", "__proto__", unknown keys, revisions 0-17 with the legacy values each upgrade step rewrites, key
// bindings with duplicates and invalid codes), 300 seeded game settings files, 7 boots.
// Per profile: outcome, the settings with each key a missing or invalid input left at its default written as '@d'
// (so a change of a default does not move the records where the default only fills a gap), the bindings, the notice
// kinds (classified from the current notice texts; the classifier is the part a text rewording updates, by adding the
// new wording as an alternative so that the frozen baseline still classifies the same), all hashed (strictHex: 16 hex
// digits per profile); the toast text as its own hash (toastHex: wording class, strict except in a wording step).
// The profiles are drawn from the frozen constants RANGES and ENUMS, not from the page (which only supplies the setting keys
// and their defaults), so that a change of a bound or of a choice in the page moves what the code makes of the same profiles,
// never the profiles themselves.
const { createPage } = require('../harness.cjs');
const { Hasher, hashOf } = require('../canon.cjs');

const N = 10000, N_INI = 300, SEED = 20260929;
// The generator's bounds, frozen: [min, max, step] of each range input of the page when this was written (chosen: a copy of
// the page's attributes, which the oracle used to read). A number without an entry is drawn around its default.
const RANGES = {
  pitchSens: [1, 100, 1], yawSens: [1, 100, 1], vehicleMultiplier: [0.1, 2, 0.05], gain: [0.005, 0.15, 0.005],
  isolation: [0, 1, 0.05], mouseReturn: [0, 12, 0.2], mouseRateScale: [0.15, 0.5, 0.001],
  mouseYawScale: [0.1, 0.6, 0.001], mouseLag: [0.02, 0.4, 0.01], mouseFine: [0.7, 1.4, 0.01], pitchRate: [20, 200, 1],
  rollRate: [20, 240, 5], yawRate: [15, 180, 1], cyclicResponse: [0.02, 0.8, 0.02], response: [0.04, 1.2, 0.02],
  cyclicYaw: [0, 0.8, 0.02], responseYaw: [0.04, 1.2, 0.01], mouseYawBoost: [0.5, 3, 0.05],
  mousePitchBoost: [0.5, 3, 0.05], collectiveUpRate: [0.5, 6, 0.1], collectiveDownRate: [0.3, 4, 0.1],
  holdGain: [0, 0.4, 0.002], holdDamping: [0, 0.3, 0.005], leverHover: [-0.4, 0.2, 0.01],
  collectiveAccel: [3, 14, 0.5], collectiveDownAccel: [1, 10, 0.5], verticalDamping: [0, 1.5, 0.05],
  quadraticDrag: [0, 0.0015, 0.00005], bodyFlowDrag: [0, 1.5, 0.05], lateralDrag: [0, 1, 0.02],
  weathervane: [0, 2, 0.05], fovCockpit: [60, 120, 1], fovChase: [60, 120, 1], bulletSpeed: [300, 1200, 10],
  rpm: [600, 12000, 100], spinUp: [0, 1, 0.01], spread: [0, 2, 0.05], gunConvergence: [50, 1000, 10],
  targetSpeed: [0, 180, 5], targetDistance: [80, 600, 10], targetSize: [0.5, 2.5, 0.1], targetCount: [1, 8, 1],
  targetAltitude: [15, 220, 5], volume: [0, 0.6, 0.02], airHealth: [10, 1000, 10], groundHealth: [10, 1500, 10],
  baseHealth: [10, 500, 10], aaLaunchers: [1, 8, 1], aaLockRange: [500, 3000, 50], aaLockTime: [0.5, 6, 0.1],
  aaMinAltitude: [0, 40, 1], aaLaunchDelay: [0, 3, 0.1], aaReload: [3, 40, 1], aaMissileSpeed: [150, 700, 10],
  aaAgility: [5, 60, 1], aaMaxConcurrent: [1, 4, 1], flareCharges: [1, 10, 1], flareCooldown: [0, 30, 1],
  aaToneHz: [400, 2500, 50], aaBeepRate: [1, 12, 0.5], infantryPerCamp: [0, 12, 1], camps: [1, 8, 1],
  convoy: [0, 8, 1], rpgPerCamp: [0, 3, 1], aaRockets: [0, 4, 1], volEngine: [0, 2, 0.05], volWeapons: [0, 2, 0.05],
  volAlerts: [0, 2, 0.05], duelBots: [1, 3, 1], duelHealth: [20, 200, 10], ciwsCount: [0, 3, 1],
};
// The generator's enumerations, frozen the same way: the scenarios, the choices of the selectors, the names of the lights.
const ENUMS = {
  scenario: ['air', 'ground', 'mixed', 'free', 'towers', 'missiles', 'assault', 'match', 'duel'], rangeType: ['air', 'ground', 'mixed'],
  trajectory: ['cross', 'circle', 'zigzag', 'static', 'evasive'], aaObjective: ['survive', 'destroy'], graphics: ['high', 'medium', 'low'],
  difficulty: ['easy', 'normal', 'real'], duelStart: ['front', 'behind', 'random'], duelEnemy: ['ah6m', 'ah6r', 'mix'], mouseLaw: ['rate', 'stick'],
  lighting: ['random', 'aube-clair', 'matin-clair', 'matin-brouillard', 'midi-clair', 'apres-midi-clair', 'apres-midi-gris', 'apres-midi-brouillard', 'soir-clair'],
};
const lcg = seed => { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const CODES = ['KeyA', 'KeyB', 'KeyC', 'KeyD', 'KeyE', 'KeyF', 'KeyG', 'KeyQ', 'KeyR', 'KeyS', 'KeyV', 'KeyW', 'KeyX', 'KeyZ', 'Digit1', 'Digit9', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'AltLeft', 'AltRight',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Mouse0', 'Mouse1', 'Mouse2', 'Unbound', 'Escape', 'Tab', 'F5', 'keyw', '', 'Mouse3', 'Numpad0'];
// Values earlier revisions wrote and the upgrade steps rewrite (upgradedSettings), drawn more often than chance would.
const LEGACY = { fov: [80, 58, 70, 90], trajectory: ['cross'], rpm: [6000], impactDamage: [36.02, 30.02, 36.01, 18.01, 0, 150.02, 99], aaLockRange: [1500, 1000], cameraMotion: [.35], speedFov: [5],
  pitchSens: [16, 20], yawSens: [8, 10], aaHitsToKill: [1, 0, 2, 3, 4], aaMissileSpeed: [300, 450], mouseRateScale: [.271, .339, .3], mouseYawScale: [.271, .339, .25], responseYaw: [.4, .35, .5], mouseFine: [1, 1.2, .5, 3, 1.4],
  mouseLaw: ['rate', 'stick', 'joystick'], lighting: ['random', 'constructor', '__proto__', 'toString', 'hasOwnProperty'], duration: [0, 60, 120, 300, 600, 900, 45], duelBots: [0, 1, 2, 3, 4, 2.6], ciwsCount: [0, 3, 5, -1] };
function classify(toast) {
  const kinds = [];
  if (/^Import refusé/.test(toast)) kinds.push('refused:' + (/Fichier trop volumineux/.test(toast) ? 'size' : /Format non reconnu/.test(toast) ? 'format' : /même touche/.test(toast) ? 'duplicate-key' : /JSON|Unexpected|position|token/i.test(toast) ? 'json' : 'other'));
  if (/Réglages alignés sur [^:]{1,60} : tangage|Sensibilités de la souris remises aux valeurs par défaut/.test(toast)) kinds.push('r12-sensitivities');
  if (/v13 : la souris suit la loi mesurée/.test(toast)) kinds.push('r14-mouse-law');
  if (/Inertie du lacet : 0,35 s/.test(toast)) kinds.push('r15-yaw-lag');
  const g = /Souris(, loi mesurée)? : gain( en tangage| en lacet)? 0,339/.exec(toast); if (g) kinds.push('r16-gain' + (g[1] ? '-stick' : '') + (g[2] ? g[2].trim().replace('en ', '-') : ''));
  const fine = /ajustement fin ×([\d,]+)/.exec(toast); if (fine) kinds.push('fine:' + fine[1]);
  const game = /^Réglages du jeu importés : (.*?)\.( Attention|$)/.exec(toast); if (game) kinds.push('ini:' + game[1].split(', ').map(s => s.split(' ')[0]).join('+') + (game[2] ? '+warn' : ''));
  return kinds;
}
function makeProfile(r, keys, defaults) {
  const settings = {}, cases = {};
  const pick = a => a[Math.floor(r() * a.length)];
  for (const k of keys) {
    const d = defaults[k], x = r();
    let c = x < .15 ? 'missing' : x < .62 ? 'valid' : x < .74 ? 'outOfRange' : x < .88 ? 'wrongType' : 'hostile';
    if (LEGACY[k] && r() < .35) { settings[k] = pick(LEGACY[k]); cases[k] = 'legacy'; continue; }
    if (c === 'missing') { cases[k] = c; continue; }
    if (typeof d === 'number') {
      const rg = RANGES[k], lo = rg ? rg[0] : d * .5 - 1, hi = rg ? rg[1] : d * 1.5 + 1;
      if (c === 'valid') { let v = lo + (hi - lo) * r(); if (rg && rg[2] && r() < .5) v = Math.round((v - lo) / rg[2]) * rg[2] + lo; settings[k] = v; }
      else if (c === 'outOfRange') settings[k] = r() < .5 ? lo - (1 + 2 * r()) * Math.abs(hi - lo + 1) : hi + (1 + 2 * r()) * Math.abs(hi - lo + 1);
      else if (c === 'wrongType') settings[k] = pick(['12', true, null, [1], { v: 1 }, '']);
      else settings[k] = pick([-0, 1e308, -1e308, 5e-324, 2 ** 53 + 2, 0.1 + 0.2]);
    } else if (typeof d === 'boolean') {
      if (c === 'valid' || c === 'outOfRange') settings[k] = r() < .5; else if (c === 'wrongType') settings[k] = pick([1, 0, 'true', null]); else settings[k] = pick([[], {}, 'false']);
    } else if (typeof d === 'string') {
      const e = ENUMS[k] || [d];
      if (c === 'valid' || c === 'outOfRange') settings[k] = pick(e); else if (c === 'wrongType') settings[k] = pick([1, true, null, ['air']]); else settings[k] = pick(['constructor', '__proto__', 'toString', 'x'.repeat(40), e[0].toUpperCase(), ' ' + e[0]]);
    } else settings[k] = d;
    cases[k] = c;
  }
  if (r() < .1) settings['unknown' + Math.floor(r() * 5)] = pick([1, 'x', true]);
  if (r() < .03) settings.__proto__x = 1;
  const revs = [undefined, 0, 1, 2, 3, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 16, 16, 17, '16', -1];
  const rev = pick(revs), bindings = {};
  for (const a of ['collectiveUp', 'collectiveDown', 'pitchUp', 'pitchDown', 'yawLeft', 'yawRight', 'rollLeft', 'rollRight', 'fire', 'flares', 'freeLook', 'shop', 'view', 'reset', 'neutral']) if (r() < .3) bindings[a] = pick(CODES);
  const doc = { version: r() < .97 ? 1 : pick([2, '1', 0]), settings, bindings };
  if (rev !== undefined) doc.tuningRevision = rev;
  if (r() < .02) delete doc.bindings; if (r() < .01) doc.settings = pick([null, [], 'x']);
  return { doc, cases };
}
function encodeSettings(h, cfg, defaults, cases) {
  for (const k of Object.keys(cfg).sort()) {
    const v = cfg[k], c = cases ? cases[k] : undefined;
    h.str(k); if (c !== 'valid' && c !== 'outOfRange' && c !== 'legacy' && Object.is(v, defaults[k])) h.str('@d'); else h.val(v);
  }
}
// Profile blocks the runtime gains after 0.9 (prefs, then secondary), read from the test hook when it exposes them and hashed
// only when they differ from a fresh page's, so that a runtime without them, and a profile that leaves them at their defaults,
// hash as they did. Reserved, not drawn from yet: the stream that will generate their hostile values (seed SEED + 3, the next
// after the three below), apart so that adding them moves none of the draws of the profiles, the game files and the boots.
const BLOCKS = ['prefs', 'secondary'];
const blockDigests = app => Object.fromEntries(BLOCKS.map(k => [k, hashOf(app[k])]));
function encodeBlocks(h, app, fresh) { for (const k of BLOCKS) if (app[k] !== undefined && hashOf(app[k]) !== fresh[k]) h.str(k).val(app[k]); }
function iniText(r) {
  const pick = a => a[Math.floor(r() * a.length)], lines = ['[/Script/Engine.GameUserSettings]', 'bUseVSync=False', '[/Script/WDGame.WDUserSettings]'];
  const val = () => pick(['0', '10', '25', '50', '100', '0.5', '1.0', '1.5', '-3', 'abc', '', '1e3', 'True', 'False', '85', '90', '120', '12.5']);
  for (const k of ['RotaryMousePitchSensitivity', 'RotaryMouseYawSensitivity', 'AirVehicleSensitivityMultiplier', 'bInvertYAxisHelicopters', 'RotaryMouseAxisIsolation', 'FirstPersonVehicleFieldOfView', 'ThirdPersonVehicleFieldOfView', 'RotaryMouseXFunction', 'RotaryMouseYFunction'])
    if (r() < .6) lines.push(k + '=' + (k.endsWith('Function') ? pick(['Yaw', 'Pitch', 'Roll', 'None']) : k.startsWith('b') ? pick(['True', 'False', '1']) : val()));
  if (r() < .1) lines.push('RotaryMousePitchSensitivity = 30');
  if (r() < .1) lines.unshift('x'.repeat(Math.floor(r() * 300)));
  return lines.join(r() < .5 ? '\r\n' : '\n');
}

async function record(rt, { log = () => {} } = {}) {
  const page = await createPage(rt, { audio: false }), app = page.app;
  const defaults = JSON.parse(JSON.stringify(app.cfg)), keys = Object.keys(defaults), blocks = blockDigests(app);
  const r = lcg(SEED), strict = [], toast = [], stats = { outcomes: {}, kinds: {} };
  const one = async (text, cases) => {
    await page.click('defaults');
    await page.importProfile(text);
    const t = page.toast(), kinds = classify(t), outcome = kinds.find(k => k.startsWith('refused:')) || 'ok';
    const h = new Hasher(); h.str(outcome); encodeSettings(h, app.cfg, defaults, outcome === 'ok' ? cases : null); h.val(app.bindings); encodeBlocks(h, app, blocks); h.val(kinds.filter(k => !k.startsWith('refused:')));
    strict.push(h.digest().slice(0, 16)); toast.push(new Hasher().str(t).digest().slice(0, 16));
    stats.outcomes[outcome] = (stats.outcomes[outcome] || 0) + 1; for (const k of kinds) { const s = k.startsWith('fine:') ? 'fine' : k; stats.kinds[s] = (stats.kinds[s] || 0) + 1; }
  };
  for (let i = 0; i < N; i++) { const p = makeProfile(r, keys, defaults); await one(JSON.stringify(p.doc), p.cases); }
  // Size limit and malformed files.
  const fixed = [JSON.stringify({ version: 1, tuningRevision: 16, settings: { pad: 'x'.repeat(100001) }, bindings: {} }), '{"version":1,', 'null', '[]', '{"version":1,"settings":{},"bindings":{}}', '{"version":1,"tuningRevision":16,"settings":{"lighting":"constructor"},"bindings":{}}'];
  for (const text of fixed) await one(text, null);
  log('settings', 'profiles', N + fixed.length, JSON.stringify(stats.outcomes));
  // Game settings files (.ini import).
  const ini = [], ri = lcg(SEED + 1), iniStats = {};
  for (let i = 0; i < N_INI; i++) {
    await page.click('defaults'); await page.importIni(iniText(ri));
    const t = page.toast(), kinds = classify(t), h = new Hasher(); h.str(/^Import refusé/.test(t) ? 'refused' : 'ok'); encodeSettings(h, app.cfg, defaults, null); encodeBlocks(h, app, blocks); h.val(kinds);
    ini.push(h.digest().slice(0, 16)); const o = /^Import refusé/.test(t) ? 'refused' : 'ok'; iniStats[o] = (iniStats[o] || 0) + 1;
  }
  await page.click('defaults'); await page.importIni('RotaryMousePitchSensitivity=30\n' + 'x'.repeat(400001)); ini.push(new Hasher().str(classify(page.toast()).join('|') || page.toast().slice(0, 20)).digest().slice(0, 16));
  // Boots with a stored profile (the path of a returning player), and with a corrupt one.
  const boots = [], rb = lcg(SEED + 2);
  const bootDocs = [0, 8, 11, 13, 15, 16].map(rev => { const p = makeProfile(rb, keys, defaults); p.doc.version = 1; p.doc.tuningRevision = rev; if (!p.doc.settings || typeof p.doc.settings !== 'object' || Array.isArray(p.doc.settings)) p.doc.settings = {}; p.doc.bindings = {}; return p; });
  for (const p of [...bootDocs, { doc: '{corrupt', cases: null }]) {
    const pg = await createPage(rt, { audio: false, storage: { 'littlebird-range-v1': typeof p.doc === 'string' ? p.doc : JSON.stringify(p.doc) } });
    const t = pg.toast(), h = new Hasher(); encodeSettings(h, pg.app.cfg, defaults, p.cases); h.val(pg.app.bindings); encodeBlocks(h, pg.app, blocks); h.val(classify(t)); h.str(pg.el('saveState').textContent.length ? 'state' : '-');
    boots.push({ revision: typeof p.doc === 'string' ? 'corrupt' : p.doc.tuningRevision, digest: h.digest().slice(0, 16), kinds: classify(t) });
  }
  const dh = new Hasher(); encodeSettings(dh, defaults, defaults, null);
  return { suite: 'settings', meta: { seed: SEED, profiles: N, fixedFiles: fixed.length, iniFiles: N_INI + 1, keys: keys.length, generator: 'settings-oracle-v1 (suites/settings.cjs makeProfile / iniText)', defaultsEncoding: "'@d' = a missing or invalid input left at the default",
    note: 'a default change moves only the records where a default flows through (upgrade steps, clamps, fallbacks)' }, stats, iniStats, strictHex: strict.join(''), toastHex: toast.join(''), iniHex: ini.join(''), boots };
}
module.exports = { record, classify, RANGES, ENUMS, blockDigests, encodeBlocks };
