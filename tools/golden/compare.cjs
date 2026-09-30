'use strict';
// Compares a fresh recording with a golden: data only (meta.node, the source manifest and other meta are reported,
// not compared). Prints the first difference of each suite as a JSON path; for session checkpoints, the first
// checkpoint that differs and the groups that differ in it; for the HUD, the first frame that differs.
// Three classes of fields:
//   strict: everything not listed below;
//   wording (probe.cjs WORDING groups; the keys text, textHex, fixedText, toastHex, labelHash; the results cards' text):
//     strict too, except in a step declared as wording (record.cjs --wording-step), where they are reported only;
//   advisory (probe.cjs ADVISORY groups; ui defaultsHash and runHash; hookapi additions): reported only.
// hookapi is a contract that may grow: every golden member must still exist with the same kind; additions are reported.
const { ADVISORY, WORDING } = require('./probe.cjs');

function firstDiff(a, b, path = '$') {
  if (Object.is(a, b)) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return { path, golden: short(a), now: short(b) };
  if (Array.isArray(a) !== Array.isArray(b)) return { path, golden: 'array:' + Array.isArray(a), now: 'array:' + Array.isArray(b) };
  const keys = Array.isArray(a) ? [...Array(Math.max(a.length, b.length)).keys()] : [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of keys) { const d = firstDiff(a[k], b[k], path + (Array.isArray(a) ? `[${k}]` : '.' + k)); if (d) return d; }
  return null;
}
const WORDING_KEYS = new Set(['text', 'textHex', 'fixedText', 'toastHex', 'labelHash']);
const strip = (v, keys = WORDING_KEYS) => Array.isArray(v) ? v.map(x => strip(x, keys)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !keys.has(k)).map(([k, x]) => [k, strip(x, keys)])) : v;
const short = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s === undefined ? 'undefined' : s.length > 120 ? s.slice(0, 117) + '...' : s; };
// Index of the first differing block of `width` characters (-1 when equal).
function hexDiff(a, b, width = 16) { a = a || ''; b = b || ''; const n = Math.max(a.length, b.length) / width; for (let i = 0; i < n; i++) if (a.slice(i * width, i * width + width) !== b.slice(i * width, i * width + width)) return i; return -1; }

// Suite-aware comparison: returns {equal, strictEqual, findings[]}.
function compareSuite(name, golden, now, { wordingStep = false } = {}) {
  const findings = []; let strict = true;
  const note = (f, isStrict = true) => { findings.push(isStrict ? f : { ...f, advisory: true }); if (isStrict) strict = false; };
  const wording = f => { findings.push({ ...f, wording: true, ...(wordingStep ? { declaredWordingStep: true } : {}) }); if (!wordingStep) strict = false; };
  // A value compared strictly without its wording fields, then as a whole in the wording class.
  const both = (g, n, p) => { const d = firstDiff(strip(g), strip(n), p); if (d) { note(d); return; } const w = firstDiff(g, n, p); if (w) wording(w); };
  const done = () => ({ strictEqual: strict, equal: strict && !findings.length, findings });
  if (name === 'sessions') {
    for (const id of Object.keys(golden.scenarios)) {
      const g = golden.scenarios[id], n = now.scenarios && now.scenarios[id]; if (!n) { note({ scenario: id, missing: true }); continue; }
      const len = Math.max(g.checkpoints.length, n.checkpoints.length); let sawWording = false, sawAdvisory = false;
      for (let i = 0; i < len; i++) {
        const cg = g.checkpoints[i], cn = n.checkpoints[i]; if (!cg || !cn) { note({ scenario: id, checkpoint: i, missing: true }); break; }
        const differ = k => cg.groups[k] !== cn.groups[k], keys = Object.keys(cg.groups);
        const strictGroups = keys.filter(k => !ADVISORY.includes(k) && !WORDING.includes(k) && differ(k)), wordingGroups = keys.filter(k => WORDING.includes(k) && differ(k)), advisory = keys.filter(k => ADVISORY.includes(k) && differ(k));
        if (strictGroups.length || cg.all !== cn.all) { note({ scenario: id, firstCheckpoint: i, frame: cg.t, groups: strictGroups, sampleGolden: g.samples[i], sampleNow: n.samples[i] }); break; }
        if (wordingGroups.length && !sawWording) { sawWording = true; wording({ scenario: id, firstCheckpoint: i, frame: cg.t, groups: wordingGroups }); }
        if (advisory.length && !sawAdvisory) { sawAdvisory = true; note({ scenario: id, checkpoint: i, advisoryGroups: advisory }, false); }
      }
      for (const k of ['scene', 'coverage', 'results']) both(g[k], n[k], `$.scenarios.${id}.${k}`);
    }
    for (const id of Object.keys(now.scenarios || {})) if (!golden.scenarios[id]) note({ scenario: id, notInGolden: true });
    return done();
  }
  if (name === 'flight' || name === 'modules') {
    const walk = (g, n, p) => { if (g && typeof g.checkpointHex === 'string') { if (g.final !== (n && n.final)) { const i = hexDiff(g.checkpointHex, n ? n.checkpointHex || '' : ''); note({ path: p, firstCheckpoint: i, step: i >= 0 ? (i + 1) * 60 : null, golden: g.final.slice(0, 16), now: n ? String(n.final).slice(0, 16) : null }); } return; }
      if (g && typeof g === 'object' && !Array.isArray(g)) { for (const k of Object.keys(g)) { if (k === 'meta') continue; walk(g[k], n && n[k], p + '.' + k); } if (n && typeof n === 'object') for (const k of Object.keys(n)) if (k !== 'meta' && !(k in g)) note({ path: p + '.' + k, notInGolden: true }); }
      else { const d = firstDiff(g, n, p); if (d) note(d); } };
    walk(name === 'flight' ? golden.runs : golden, name === 'flight' ? now.runs : now, '$');
    return done();
  }
  if (name === 'hud') {
    for (const key of Object.keys(golden.runs)) {
      const g = golden.runs[key], n = now.runs[key], p = `$.runs.${key}`, every = golden.meta.every; if (!n) { note({ path: p, missing: true }); continue; }
      { const i = hexDiff(g.digestHex, n.digestHex); if (i >= 0) note({ path: p + '.digestHex', firstFrame: (i + 1) * every, index: i }); }
      { const i = hexDiff(g.textHex, n.textHex); if (i >= 0) wording({ path: p + '.textHex', firstFrame: (i + 1) * every, index: i }); }
      const rest = o => { const { digestHex, textHex, ...r } = o; return r; };
      both(rest(g), rest(n), p);
    }
    return done();
  }
  if (name === 'settings') {
    for (const k of ['strictHex', 'iniHex']) { const i = hexDiff(golden[k], now[k]); if (i >= 0) note({ field: k, firstRecord: i }); }
    { const i = hexDiff(golden.toastHex, now.toastHex); if (i >= 0) wording({ field: 'toastHex', firstRecord: i }); }
    const d = firstDiff(golden.boots, now.boots, '$.boots'); if (d) note(d);
    return done();
  }
  if (name === 'ui') {
    const d1 = firstDiff({ ...golden.inventory, labelHash: 0, defaultsHash: 0 }, { ...now.inventory, labelHash: 0, defaultsHash: 0 }, '$.inventory'); if (d1) note(d1);
    if (golden.inventory.labelHash !== now.inventory.labelHash) wording({ path: '$.inventory.labelHash', labelsOnly: !d1 });
    if (golden.inventory.defaultsHash !== now.inventory.defaultsHash) note({ path: '$.inventory.defaultsHash' }, false);
    const noRun = l => l.map(x => ({ ...x, runHash: 0 })); const d2 = firstDiff(noRun(golden.sessionConfigs), noRun(now.sessionConfigs), '$.sessionConfigs'); if (d2) note(d2);
    golden.sessionConfigs.forEach((c, i) => { if (now.sessionConfigs[i] && c.runHash !== now.sessionConfigs[i].runHash) note({ path: `$.sessionConfigs[${i}].runHash` }, false); });
    return done();
  }
  if (name === 'hookapi') {
    const ge = golden.exposed, ne = now.exposed || {};
    for (const k of Object.keys(ge)) { if (!(k in ne)) note({ path: '$.exposed.' + k, removed: true }); else if (ge[k] !== ne[k]) note({ path: '$.exposed.' + k, golden: ge[k], now: ne[k] }); }
    const added = Object.keys(ne).filter(k => !(k in ge)); if (added.length) note({ path: '$.exposed', added }, false);
    const gd = new Set(golden.trainerDiagnostics), nd = new Set(now.trainerDiagnostics || []);
    const lost = [...gd].filter(k => !nd.has(k)); if (lost.length) note({ path: '$.trainerDiagnostics', removed: lost });
    const more = [...nd].filter(k => !gd.has(k)); if (more.length) note({ path: '$.trainerDiagnostics', added: more }, false);
    for (const k of ['globalsRead', 'automationPointerLock']) { const d = firstDiff(golden[k], now[k], '$.' + k); if (d) note(d); }
    return done();
  }
  const { meta: gm, ...gd } = golden, { meta: nm, ...nd } = now;
  both(gd, nd, '$');
  return done();
}
module.exports = { compareSuite, firstDiff, hexDiff, strip, WORDING_KEYS };
