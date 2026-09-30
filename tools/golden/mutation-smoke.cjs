'use strict';
// Mutation smoke test of the goldens (extended with sensitivity probes). Each mutant is a
// scratch copy of the runtime with ONE deliberate change (every edit must match exactly the expected number of
// times), checked against the recorded goldens with record.cjs --check --report. A mutant passes when every suite
// named in `expect` gives the expected verdict and its extra condition holds (the difference is found where it should
// be: a checkpoint group, a run, a declared scope).
//   node mutation-smoke.cjs --src <runtime> --template <file> --inputs <dir> --golden <dir> [--private-golden <dir>]
//                           --scratch <dir> [--jobs 4] [--only id,id]
// Kinds of mutants:
//   one-ulp numeric constants (physics, missiles, the ground friction of a touchdown, option branches), a default
//   parameter; random-draw order swaps (bot gun spread; an effect-only draw: structure smoke); number formats of the HUD
//   (canvas and DOM); a wrong compass letter; the declared R5.7 fix reverted (its difference must stay inside the
//   declared scope); behaviour-neutral refactors (a comment and blank lines, an unused field, a renamed field mapped by the
//   alias table of a copied recorder, an added hook member) that must change nothing; a wording step (strict without
//   --wording-step, accepted with it); the automation pointer-lock shim switched off (the user-safety invariant).
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const abs = k => arg(k) && path.resolve(arg(k));
const src = abs('src'), template = abs('template'), inputs = abs('inputs'), golden = abs('golden'), privateGolden = abs('private-golden'), scratch = abs('scratch');
const jobs = +arg('jobs', 4), only = arg('only') ? arg('only').split(',') : null;
const nextUp = x => { const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, x); b.setBigUint64(0, b.getBigUint64(0) + 1n); return b.getFloat64(0); };
const RUNTIME = ['world.js', 'physics.js', 'forest.js', 'scenery.js', 'missiles.js', 'audio.js', 'models.js', 'ground.js', 'bot.js', 'app.js', 'vendor/three.min.js'];
const ALLS = 'flight,sessions,world,audio,hud,settings,models,ui,modules,hookapi';
const AD = ['missiles', 'match', 'missiles-destroy'];   // the air-defence sessions (declared scope of R5.7)

// Helpers over a check report: the suites' findings.
const F = (rep, s) => (rep.suites[s] || { findings: [] }).findings;
const strictF = (rep, s) => F(rep, s).filter(f => !f.advisory && !(f.wording && f.declaredWordingStep));
const sessionGroups = (rep, pred) => strictF(rep, 'sessions').some(f => f.groups && f.groups.some(pred));
const MUTANTS = [
  { id: 'physics-G-ulp', edits: [['physics.js', 'const G = 9.81;', () => 'const G = ' + nextUp(9.81) + ';']], suites: 'flight,sessions', expect: { flight: 'DIFF', parity: 'DIFF', sessions: 'DIFF' } },
  { id: 'physics-weathervane-ulp', edits: [['physics.js', 'const tau=1.1*(55.6/vh)**2;', () => 'const tau=1.1*(' + nextUp(55.6) + '/vh)**2;']], suites: 'flight,sessions', expect: { flight: 'DIFF', sessions: 'DIFF' } },
  // A default parameter: the flight goldens run explicit settings objects and stay the same; the bots fly the module
  // defaults (sessions) and the defaults snapshot moves (modules).
  { id: 'physics-default-ulp', edits: [['physics.js', 'quadraticDrag:0.0003,', () => 'quadraticDrag:' + nextUp(0.0003) + ',']], suites: 'flight,sessions,modules', expect: { flight: 'SAME', parity: 'SAME', sessions: 'DIFF', modules: 'DIFF' } },
  { id: 'missiles-eject-ulp', edits: [['missiles.js', 'EJECT_SPEED=20', () => 'EJECT_SPEED=' + nextUp(20)]], suites: 'sessions,modules', expect: { sessions: 'DIFF', modules: 'DIFF' } },
  // Ground friction of a slide on the skids: the factor itself moved by one ulp (moving the literal 3 by one ulp is an
  // equivalent mutant: Math.exp(-3*dt) absorbs it; the first value of the literal that changes the factor is 31 ulps
  // above 3).
  { id: 'ground-friction-x-ulp', edits: [['physics.js', 'v.x*=Math.exp(-3*dt);', () => 'v.x*=Math.exp(-3*dt)*(1+2**-52);']], suites: 'flight', expect: { flight: 'DIFF' },
    check: rep => strictF(rep, 'flight').some(f => /touchdown-slide/.test(f.path)) || 'no touchdown run differs' },
  { id: 'ground-friction-z-ulp', edits: [['physics.js', 'v.z*=Math.exp(-3*dt);', () => 'v.z*=Math.exp(-3*dt)*(1+2**-52);']], suites: 'flight', expect: { flight: 'DIFF' },
    check: rep => strictF(rep, 'flight').some(f => /touchdown-slide/.test(f.path)) || 'no touchdown run differs' },
  { id: 'option-cross-ulp', edits: [['app.js', "if(run.trajectory==='cross')x+=Math.sin(phase)*100;", () => "if(run.trajectory==='cross')x+=Math.sin(phase)*" + nextUp(100) + ';']], suites: 'sessions', expect: { sessions: 'DIFF' },
    check: rep => strictF(rep, 'sessions').some(f => f.scenario === 'air-cross') || 'air-cross does not differ' },
  { id: 'option-duel-behind-ulp', edits: [['app.js', "(run.duelStart==='front'?-1300:750)", () => "(run.duelStart==='front'?-1300:" + nextUp(750) + ')']], suites: 'sessions', expect: { sessions: 'DIFF' },
    check: rep => strictF(rep, 'sessions').some(f => f.scenario === 'duel-behind') || 'duel-behind does not differ' },
  { id: 'verba-engage-exit-wait-ulp', edits: [['ground.js', "if(s.state==='engage'){if(engaged)return;s.state='patrol';s.target=null;s.wait=1+s.random()*2;return;}", () => "if(s.state==='engage'){if(engaged)return;s.state='patrol';s.target=null;s.wait=1+s.random()*" + nextUp(2) + ';return;}']], suites: 'sessions,modules', expectAny: ['sessions', 'modules'] },
  // Random draw order.
  { id: 'rng-swap-bot-spread', edits: [['app.js', 'const spread=Math.tan(BOT_CFG.spread*Math.PI/180),r=Math.sqrt(Math.random())*spread,angle=Math.random()*Math.PI*2;', () => 'const spread=Math.tan(BOT_CFG.spread*Math.PI/180),angle=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*spread;']], suites: 'sessions', expect: { sessions: 'DIFF' },
    check: rep => strictF(rep, 'sessions').some(f => f.firstCheckpoint !== undefined) || 'no checkpoint differs' },
  { id: 'rng-swap-structure-smoke', edits: [['app.js', 'const p=st.position.clone().add(V3((Math.random()-.5)*3,1+Math.random()*2,(Math.random()-.5)*3));', () => 'const p=st.position.clone().add(((a,b,c)=>V3(c,b,a))((Math.random()-.5)*3,1+Math.random()*2,(Math.random()-.5)*3));']], suites: 'sessions', expect: { sessions: 'DIFF' },
    check: rep => sessionGroups(rep, g => g === 'effects') || 'the effects group of no checkpoint differs' },
  // HUD numbers and letters.
  { id: 'hud-canvas-altitude-floor', edits: [['app.js', 'String(Math.round(altitude))', () => 'String(Math.floor(altitude))']], suites: 'hud,sessions', expect: { hud: 'DIFF', sessions: 'DIFF' } },
  { id: 'hud-canvas-cardinal-bug', edits: [['app.js', 'CARDINALS[Math.round(H/45)%8]', () => 'CARDINALS[Math.floor(H/45)%8]']], suites: 'hud,sessions', expect: { hud: 'DIFF', sessions: 'DIFF' } },
  { id: 'hud-dom-vario-format', edits: [['app.js', "$('vario').textContent=(vario>0?'+':'')+vario.toFixed(1);", () => "$('vario').textContent=(vario>0?'+':'')+vario.toFixed(2);"]], suites: 'sessions', expect: { sessions: 'DIFF' },
    check: rep => sessionGroups(rep, g => g === 'domHud') || 'the domHud group does not differ' },
  { id: 'hud-dom-speed-floor', edits: [['app.js', "$('speed').textContent=Math.round(flight.velocity.length()*3.6);", () => "$('speed').textContent=Math.floor(flight.velocity.length()*3.6);"]], suites: 'sessions', expect: { sessions: 'DIFF' },
    check: rep => sessionGroups(rep, g => g === 'domHud') || 'the domHud group does not differ' },
  // The declared behaviour change R5.7 (ground.js decideVerba reload race), reverted: the race comes back, and its
  // difference stays inside the declared scope (the Verba module cases, the air-defence sessions and HUD runs).
  { id: 'reverted-verba-reload-fix', edits: [['ground.js', "      if(s.state==='engage'&&L.state==='idle'&&L.reload>0)return;\n", () => '']],
    suites: 'modules,sessions,hud,flight,world,ui,hookapi', expect: { modules: 'DIFF', flight: 'SAME', parity: 'SAME', world: 'SAME', ui: 'SAME', hookapi: 'SAME' },
    check: rep => { const m = strictF(rep, 'modules'), out = m.filter(f => !/^\$\.ground\.verba/.test(f.path)), s = strictF(rep, 'sessions').filter(f => !AD.includes(f.scenario));
      return !m.some(f => /^\$\.ground\.verbaReloadSkipped/.test(f.path)) ? 'the race counter did not move' : out.length ? 'module differences outside the Verba cases: ' + JSON.stringify(out.slice(0, 2)) : s.length ? 'session differences outside the air-defence scenarios: ' + JSON.stringify(s.slice(0, 2)) : true; } },
  // Behaviour-neutral changes: nothing may move.
  { id: 'refactor-comments', edits: [['physics.js', '(function(root) {', () => '// mutation smoke: a comment changes no behaviour\n(function(root) {'], ['app.js', '    function drawHud(){', () => '    // a comment changes no behaviour\n    function drawHud(){ /* and an inline one */'], ['ground.js', '    decideVerba(s,heli,dist,L){', () => '    // a comment\n\n    decideVerba(s,heli,dist,L){  ']],
    suites: ALLS, expectAll: 'SAME' },
  { id: 'refactor-unused-field', edits: [['ground.js', "const role=opts.role||'rifle',s={id:this.nextId++,", () => "const role=opts.role||'rifle',s={unusedField:0,id:this.nextId++,"]], suites: 'sessions,modules,hud', expectAll: 'SAME' },
  // A renamed field, mapped back by the alias table of a copied recorder: the data suites are the same, and the check
  // reports the recorder change (to be proven with prove-recorder.cjs before it is adopted).
  { id: 'refactor-renamed-field', edits: [['ground.js', /\bcalm\b/g, () => 'composure', 5]], aliases: { soldier: { composure: 'calm' }, 'ground.soldier': { composure: 'calm' } }, suites: 'sessions,modules', expect: { sessions: 'SAME', modules: 'SAME' }, recorderDiff: true },
  { id: 'hook-member-added', edits: [['app.js', 'window.__LB_EXPOSE__({start,', () => 'window.__LB_EXPOSE__({addedForTests:1,start,']], suites: 'hookapi', expect: { hookapi: 'SAME' },
    check: rep => F(rep, 'hookapi').some(f => f.advisory && f.added && f.added.includes('addedForTests')) || 'the addition is not reported' },
  // Wording: the HUD's vendor hint reworded. Strict without the flag; accepted, and reported, in a declared wording step.
  { id: 'wording-undeclared', edits: [['app.js', "const text='ACHETER DES MUNITIONS / FOURNITURES'", () => "const text='RAVITAILLEMENT'"]], suites: 'hud', expect: { hud: 'DIFF' },
    check: rep => F(rep, 'hud').every(f => f.wording) || 'a non-wording field differs' },
  { id: 'wording-declared', edits: [['app.js', "const text='ACHETER DES MUNITIONS / FOURNITURES'", () => "const text='RAVITAILLEMENT'"]], flags: ['--wording-step'], suites: 'hud,sessions', expect: { hud: 'SAME', sessions: 'SAME' },
    check: rep => F(rep, 'hud').some(f => f.wording && f.declaredWordingStep) || 'the wording change is not seen' },
  // User safety: with the automation shim switched off, the page would take the real pointer lock.
  { id: 'automation-shim-off', edits: [['app.js', "navigator.webdriver===true&&!window.__LB_REAL_POINTER_LOCK__", () => "navigator.webdriver===false&&!window.__LB_REAL_POINTER_LOCK__"]], suites: 'hookapi', expect: { hookapi: 'DIFF' },
    check: rep => strictF(rep, 'hookapi').some(f => /automationPointerLock/.test(f.path)) || 'the automation boot does not differ' }
];

function copyRecorder(to, aliases) {
  const from = __dirname; fs.rmSync(to, { recursive: true, force: true }); fs.mkdirSync(path.join(to, 'suites'), { recursive: true });
  for (const f of fs.readdirSync(from)) if (/\.(cjs|json)$/.test(f)) fs.copyFileSync(path.join(from, f), path.join(to, f));
  for (const f of fs.readdirSync(path.join(from, 'suites'))) fs.copyFileSync(path.join(from, 'suites', f), path.join(to, 'suites', f));
  fs.writeFileSync(path.join(to, 'probe-aliases.json'), JSON.stringify({ $comment: 'mutation smoke copy', ...aliases }, null, 1) + '\n');
}
function prepare(m) {
  const dir = path.join(scratch, m.id, 'runtime'); fs.rmSync(path.join(scratch, m.id), { recursive: true, force: true }); fs.mkdirSync(path.join(dir, 'vendor'), { recursive: true });
  for (const f of RUNTIME) fs.copyFileSync(path.join(src, f), path.join(dir, f));
  for (const [file, from, to, count = 1] of m.edits) {
    const p = path.join(dir, file), s = fs.readFileSync(p, 'latin1');
    const n = from instanceof RegExp ? (s.match(from) || []).length : s.split(from).length - 1;
    if (n !== count) throw Error(`${m.id}: ${file}: expected ${count} match(es), found ${n}: ${String(from).slice(0, 80)}`);
    fs.writeFileSync(p, from instanceof RegExp ? s.replace(from, to) : s.replace(from, to), 'latin1');
  }
  if (m.aliases) copyRecorder(path.join(scratch, m.id, 'recorder'), m.aliases);
  return dir;
}
function run(m) {
  return new Promise(resolve => {
    const dir = prepare(m), t0 = Date.now(), rep = path.join(scratch, m.id, 'report.json');
    const recorder = m.aliases ? path.join(scratch, m.id, 'recorder', 'record.cjs') : path.join(__dirname, 'record.cjs');
    const a = [recorder, '--src', dir, '--template', template, '--inputs', inputs, '--check', golden, '--suites', m.suites, '--report', rep, '--quiet', ...(m.flags || [])];
    if (privateGolden) a.push('--private-check', privateGolden);
    const p = spawn(process.execPath, a, { stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('close', code => {
      const lines = out.split(/\r?\n/).filter(l => /^(SAME|DIFF) /.test(l)), got = Object.fromEntries(lines.map(l => { const [v, name] = l.split(' '); return [name, v]; }));
      let report = null; try { report = JSON.parse(fs.readFileSync(rep, 'utf8')); } catch (e) { /* no report: the run crashed */ }
      const problems = [];
      if (!report) problems.push('no report (exit ' + code + '): ' + err.slice(-300));
      else {
        if (m.recorderDiff ? got.recorder !== 'DIFF' : got.recorder !== 'SAME') problems.push('recorder line ' + got.recorder);
        for (const [s, v] of Object.entries(m.expect || {})) if (got[s] !== v) problems.push(`${s}: expected ${v}, got ${got[s]}`);
        if (m.expectAll) for (const [s, v] of Object.entries(got)) if (s !== 'recorder' && v !== m.expectAll) problems.push(`${s}: expected ${m.expectAll}, got ${v}`);
        if (m.expectAll && Object.keys(got).length < m.suites.split(',').length) problems.push('suites missing from the output');
        if (m.expectAny && !m.expectAny.some(s => got[s] === 'DIFF')) problems.push('expected a difference in one of ' + m.expectAny.join(', '));
        if (m.check) { const c = m.check(report); if (c !== true) problems.push(c); }
      }
      const r = { id: m.id, change: m.edits.map(([f, from, to]) => `${f}: ${String(from).slice(0, 70)} -> ${String(to()).split('\n').pop().slice(0, 70)}`), flags: m.flags || [], got, exit: code, pass: !problems.length, problems,
        seconds: +((Date.now() - t0) / 1000).toFixed(1), findings: report ? Object.fromEntries(Object.entries(report.suites).map(([k, v]) => [k, v.findings.slice(0, 4)])) : null };
      console.log(`${r.pass ? 'PASS' : 'FAIL'} ${m.id}: ${JSON.stringify(got)}${problems.length ? ' ' + problems.join('; ') : ''} (${r.seconds} s)`); resolve(r);
    });
  });
}
// The alias mechanism in process: a renamed field hashes like its golden name, an added field is left out.
function aliasSelfTest() {
  const { FieldHasher } = require('./probe.cjs'), { Hasher } = require('./canon.cjs');
  const rec = new FieldHasher(), h1 = new Hasher(); for (const [k, v] of rec.fields('t', { a: 1, b: 2, c: 'x' })) h1.str(k).val(v);
  const chk = new FieldHasher(rec.json(), { t: { renamed: 'a' } }), h2 = new Hasher(); for (const [k, v] of chk.fields('t', { renamed: 1, b: 2, c: 'x', added: 5 })) h2.str(k).val(v);
  return h1.digest() === h2.digest();
}
(async () => {
  fs.mkdirSync(scratch, { recursive: true });
  const todo = MUTANTS.filter(m => !only || only.includes(m.id)); for (const m of todo) prepare(m);   // fail fast on a bad edit
  const results = []; let i = 0;
  await Promise.all(Array.from({ length: jobs }, async () => { while (i < todo.length) { const m = todo[i++]; results.push(await run(m)); } }));
  results.sort((a, b) => todo.findIndex(m => m.id === a.id) - todo.findIndex(m => m.id === b.id));
  const alias = aliasSelfTest(); console.log(`${alias ? 'PASS' : 'FAIL'} alias self-test`);
  const ok = alias && results.every(r => r.pass);
  fs.writeFileSync(path.join(scratch, 'mutation-smoke.json'), JSON.stringify({ node: process.version, aliasSelfTest: alias, pass: ok, mutants: results }, null, 1) + '\n');
  console.log(`${results.filter(r => r.pass).length}/${results.length} mutants as expected`);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e && e.stack || e); process.exit(2); });
