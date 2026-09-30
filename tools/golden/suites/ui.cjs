'use strict';
// G6 UI inventory and G7 session configuration goldens.
// G6: every control of the menus as the page has it after boot (template plus the options the app adds): id, place
// (tab or screen), section, order, type, min, max, step, unit, select option values, the modes whose panel shows it;
// buttons with their data-* roles; the key-binding rows. Texts (labels, option texts, section titles, button texts) are
// hashed apart (labelHash), so a wording step shows as labels-only; the defaults are hashed apart too (advisory).
// G7: for each mode card, range type and option set, the session configuration the menus hand to start() (app.run):
// the rules the mode forces (keys where run differs from the menu's cfg) with their values, and the values the
// script set; the whole run object only as an advisory hash (it contains every default).
const { createPage } = require('../harness.cjs');
const { Hasher } = require('../canon.cjs');

const txt = s => new Hasher().str(String(s).replace(/\s+/g, ' ').trim()).digest().slice(0, 16);
function placeOf(el) { for (let x = el; x; x = x.parentElement) { if (x.classList && x.classList.contains('tab') && x.id) return x.id; if (['pause', 'shop', 'results', 'loading', 'calibPanel'].includes(x.id)) return x.id; } return 'root'; }
function modesOf(el) { for (let x = el; x; x = x.parentElement) if (x.classList && x.classList.contains('opt') && x.dataset.for) return x.dataset.for.split(' '); return null; }
// The calibration tools stay private (maintainer decision): their controls and buttons (the calibration tab and panel, the
// tab's button, the pause menu's journal button) go to a private sidecar, never to the public fixture. 'order' is the
// rank among the public inventoried elements, so that removing the private ones (S8d) leaves the public inventory as
// it is.
const PRIVATE_PLACES = new Set(['calib', 'calibPanel']), PRIVATE_IDS = new Set(['pauseJournal']);
const isPrivate = el => PRIVATE_PLACES.has(placeOf(el)) || PRIVATE_IDS.has(el.id) || el.dataset && el.dataset.tab === 'calib';
function inventory(page) {
  const doc = page.document, order = new Map(); let n = 0; const walk = e => { order.set(e, n++); for (const c of e.children) walk(c); }; walk(doc.documentElement);
  const marks = doc.querySelectorAll('.crumb, summary').map(e => ({ at: order.get(e), place: placeOf(e), text: e.textContent }));
  const sectionOf = el => { let s = null; const at = order.get(el), p = placeOf(el); for (const m of marks) if (m.at < at && m.place === p) s = m.text; return s === null ? null : txt(s); };
  const items = doc.querySelectorAll('input[id], select[id], button'), rank = new Map(); let r = 0; for (const el of items) if (!isPrivate(el)) rank.set(el, r++);
  const side = () => ({ controls: [], buttons: [], labels: new Hasher(), defaults: new Hasher() }), pub = side(), priv = side(), cfg = page.app.cfg, privateIds = new Set();
  for (const el of doc.querySelectorAll('input[id], select[id]')) {
    const P = isPrivate(el) ? priv : pub; if (P === priv) privateIds.add(el.id);
    const label = el.closest('label'), c = { id: el.id, place: placeOf(el), section: sectionOf(el), order: P === pub ? rank.get(el) : order.get(el), tag: el.localName, type: el.type, modes: modesOf(el) };
    for (const a of ['min', 'max', 'step', 'accept']) if (el.hasAttribute(a)) c[a] = el.getAttribute(a);
    if (el.dataset.unit) c.unit = txt(el.dataset.unit);
    // Option values in clear when they are plain lower-case tokens; others (the light presets' ids, names to be
    // replaced by neutral ones) hashed.
    if (el.localName === 'select') c.options = el.options.map(o => /^[a-z0-9.\-]*$/.test(o.value) ? o.value : '#' + txt(o.value));
    c.inCfg = el.id in cfg;
    P.controls.push(c);
    P.labels.str(el.id).str(label ? txt(label.textContent) : '-'); if (el.localName === 'select') for (const o of el.options) P.labels.str(txt(o.textContent));
    P.defaults.str(el.id).val(cfg[el.id]);
  }
  for (const b of doc.querySelectorAll('button')) {
    const P = isPrivate(b) ? priv : pub, o = { id: b.id || null, place: placeOf(b), order: P === pub ? rank.get(b) : order.get(b) }; for (const [k, v] of Object.entries(b.dataset)) o['data-' + k] = v; P.labels.str(txt(b.textContent));
    if (o.id || Object.keys(o).some(k => k.startsWith('data-'))) P.buttons.push(o);
  }
  const bindings = page.document.getElementById('bindings').children.map(row => { pub.labels.str(txt(row.textContent)); return row.children.length; });
  const hiddenSettings = Object.keys(cfg).filter(k => !doc.getElementById(k) && !privateIds.has(k)).sort();
  return { public: { controls: pub.controls, buttons: pub.buttons, bindingRows: bindings.length, bindingActions: Object.keys(page.app.bindings), settingsWithoutControl: hiddenSettings, labelHash: pub.labels.digest(), defaultsHash: pub.defaults.digest() },
    private: { controls: priv.controls, buttons: priv.buttons, labelHash: priv.labels.digest(), defaultsHash: priv.defaults.digest() } };
}
const COMBOS = [
  ...['air', 'ground', 'mixed'].flatMap(s => [{ mode: 'range', seg: s }, { mode: 'range', seg: s, set: { trajectory: 'circle', targetCount: 6 } }]),
  ...['assault', 'missiles', 'match', 'duel'].flatMap(m => ['easy', 'normal', 'real'].map(d => ({ mode: m, set: { difficulty: d } }))),
  { mode: 'towers' }, { mode: 'free' }, { mode: 'missiles', set: { aaObjective: 'destroy', aaLaunchers: 6 } },
  { mode: 'duel', set: { duelBots: 3, duelEnemy: 'mix', duelStart: 'random', duelRespawn: false } }, { mode: 'match', set: { ciwsCount: 2, duration: 300 } }, { mode: 'assault', set: { enemyFire: true, aaEverywhere: true } }
];
async function sessionConfigs(page) {
  const out = [];
  for (const c of COMBOS) {
    await page.click('defaults');
    await page.click(page.document.querySelector(`[data-mode="${c.mode}"]`));
    if (c.seg) await page.click(page.document.querySelector(`[data-scenario="${c.seg}"]`));
    for (const [k, v] of Object.entries(c.set || {})) await page.setInput(k, v);
    const visible = page.document.querySelectorAll('.opt[data-for]').filter(e => !e.hidden).map(e => e.querySelectorAll('input[id], select[id]').map(x => x.id).join('+') || e.className);
    await page.click('start');
    const run = page.app.run, cfg = page.app.cfg, rules = {};
    for (const k of Object.keys(run).sort()) if (!Object.is(run[k], cfg[k])) rules[k] = run[k];
    const set = {}; for (const k of Object.keys(c.set || {})) set[k] = cfg[k];
    out.push({ combo: c, scenario: run.scenario, rules, set, visibleOptions: visible, running: page.app.running, runHash: new Hasher().val(run).digest().slice(0, 16) });
    page.app.pause(); await page.flush();
  }
  return out;
}
async function record(rt, { log = () => {} } = {}) {
  const page = await createPage(rt, { audio: false });
  const inv = inventory(page);
  const configs = await sessionConfigs(page);
  log('ui', 'controls', inv.public.controls.length, 'buttons', inv.public.buttons.length, 'combos', configs.length, 'private controls', inv.private.controls.length, 'private buttons', inv.private.buttons.length);
  return { suite: 'ui', meta: { combos: COMBOS.length, note: 'texts hashed apart (labelHash: wording class); defaults hashed apart (defaultsHash: advisory); the calibration tools are in a private sidecar' },
    inventory: inv.public, sessionConfigs: configs, __private: { suite: 'ui-private', note: 'private: the calibration controls and buttons (never published)', calibration: inv.private } };
}
module.exports = { record, inventory };
