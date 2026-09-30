#!/usr/bin/env node
// G-DESK and G5 on a packaged executable: runs its built-in self-test (desktop/self-test.cjs) and a few hostile
// launches, and reads the verdicts back. Never shows a window that can take the mouse or the keyboard: every launch
// carries --lb-self-test, so even a launch that should have been refused would only run the hidden self-test.
//   node scripts/desktop-smoke.mjs <LittleBirdTrainer.exe> [--warp] [--tamper] [--json <file>]
// Checks:
//   self-test         the positive and negative probes pass (emulated pointer lock asserted before Start, G5 parity)
//   fuses at runtime  with ELECTRON_RUN_AS_NODE=1 and NODE_OPTIONS=--require=<missing module> in the environment, the
//                     executable still runs the app (RunAsNode and NodeOptions fuses off)
//   refused switches  --remote-debugging-port, --inspect, --no-sandbox, --gpu-launcher and --enable-features make the
//                     packaged app exit with code 2
//   bad self-test     a malformed --lb-self-test, or one without LB_SELF_TEST=<nonce> in the environment, makes it exit
//                     with code 3
//   tamper (--tamper) a copy whose app.asar has one byte changed does not start (asar integrity fuse)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const REPORTS = path.join(os.tmpdir(), 'littlebird-self-test');
const nonce = () => crypto.randomBytes(12).toString('hex');

// Starts the executable, waits for its exit (killing the process tree after `timeout` ms), returns {code, report}.
// The self-test also needs LB_SELF_TEST=<nonce> in its environment (desktop/policy.cjs selfTestArgs); selfTestEnv:
// false leaves it out (a launch that must be refused).
export function launch(exe, args, { env = {}, timeout = 420_000, id = nonce(), selfTestEnv = true } = {}) {
  const report = path.join(REPORTS, `report-${id}.json`);
  fs.rmSync(report, { force: true });
  return new Promise((resolve) => {
    let child;
    try {
      const base = { ...process.env };
      delete base.LB_SELF_TEST;
      child = spawn(
        exe,
        args.map((a) => a.replace('<nonce>', id)),
        {
          env: { ...base, ...(selfTestEnv ? { LB_SELF_TEST: id } : {}), ...env },
          stdio: 'ignore',
          windowsHide: true,
        },
      );
    } catch (e) {
      // For example Windows Smart App Control refusing an unsigned build ("spawn UNKNOWN").
      return resolve({ code: null, spawnError: e.code || String(e), report: null, seconds: 0 });
    }
    child.on('error', (e) => resolve({ code: null, spawnError: e.code || String(e), report: null, seconds: 0 }));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F']);
      else child.kill('SIGKILL');
    }, timeout);
    const t0 = Date.now();
    child.on('exit', (code) => {
      clearTimeout(timer);
      // Give the exiting process a moment to release its files, then read and clean up.
      setTimeout(() => {
        const data = fs.existsSync(report) ? JSON.parse(fs.readFileSync(report, 'utf8')) : null;
        fs.rmSync(path.join(REPORTS, `profile-${id}`), { recursive: true, force: true });
        resolve({ code, timedOut, report: data, seconds: Math.round((Date.now() - t0) / 100) / 10 });
      }, 1500);
    });
  });
}

export async function smoke(exe, { warp = false, tamper = false, log = console.log } = {}) {
  const extra = warp ? ['--lb-warp'] : [];
  const results = {};
  const problems = [];
  // 1. The self-test.
  const main = await launch(exe, ['--lb-self-test=<nonce>', ...extra]);
  results.selfTest = { code: main.code, seconds: main.seconds, report: main.report };
  if (main.spawnError) {
    problems.push(
      `the executable could not be started (${main.spawnError}): on Windows, Smart App Control or an ` +
        'application control policy may refuse an unsigned build',
    );
    return { ok: false, problems, results };
  }
  if (main.code !== 0 || !main.report || !main.report.ok)
    problems.push('self-test failed: ' + (main.report ? main.report.failure : `exit ${main.code}, no report`));
  else log(`self-test: OK in ${main.seconds} s (${summary(main.report)})`);
  // 2. Fuses at runtime: Node-mode environment variables are ignored.
  const fused = await launch(exe, ['--lb-self-test=<nonce>', ...extra], {
    env: { ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '--require=./littlebird-no-such-module.cjs' },
  });
  results.nodeEnvironment = { code: fused.code, ok: !!(fused.report && fused.report.ok) };
  if (!results.nodeEnvironment.ok || fused.code !== 0)
    problems.push(
      `with ELECTRON_RUN_AS_NODE and NODE_OPTIONS set the app did not run its self-test (exit ${fused.code})`,
    );
  else log('fuses at runtime: ELECTRON_RUN_AS_NODE and NODE_OPTIONS ignored');
  // 3. Refused switches and a malformed self-test argument.
  // A refused switch exits with code 2 before the app is ready, the self-test report naming the switch; a malformed
  // self-test argument exits with code 3 and no report.
  // --gpu-launcher would run a command in front of the GPU process (it names a harmless missing program here).
  const hostile = [
    [['--remote-debugging-port=0'], 2, 'remote-debugging-port'],
    [['--inspect=0'], 2, 'inspect'],
    [['--no-sandbox'], 2, 'no-sandbox'],
    [['--gpu-launcher=littlebird-no-such-program'], 2, 'gpu-launcher'],
    [['--enable-features=LittleBirdProbe'], 2, 'enable-features'],
    [['--lb-self-test=zz'], 3, null],
    [[], 3, null, { selfTestEnv: false }],
  ];
  results.refused = [];
  for (const [args, want, name, opts = {}] of hostile) {
    const r = await launch(exe, ['--lb-self-test=<nonce>', ...args, ...extra], { timeout: 60_000, ...opts });
    const ok = r.code === want && (name ? !!r.report && r.report.refused === name && !r.report.ok : !r.report);
    const label = args.join(' ') || 'no LB_SELF_TEST in the environment';
    results.refused.push({ args: label, code: r.code, refused: r.report && r.report.refused, ok });
    if (!ok)
      problems.push(
        `${label}: exit ${r.code}, report ${JSON.stringify(r.report && r.report.failure)}, expected ${want}`,
      );
  }
  if (results.refused.every((r) => r.ok)) log('refused switches: ' + results.refused.map((r) => r.args).join(', '));
  // 4. A tampered copy.
  if (tamper) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-tamper-'));
    try {
      const src = path.dirname(exe);
      fs.cpSync(src, dir, { recursive: true });
      const asar = path.join(dir, 'resources', 'app.asar');
      const buf = fs.readFileSync(asar);
      const at = buf.indexOf(Buffer.from('LittleBird', 'utf8'), buf.length - 200_000);
      if (at < 0) throw new Error('no text to change in app.asar');
      buf[at] = buf[at] ^ 0x20; // one letter's case, same length
      fs.writeFileSync(asar, buf);
      const r = await launch(path.join(dir, path.basename(exe)), ['--lb-self-test=<nonce>', ...extra], {
        timeout: 90_000,
      });
      results.tamper = { code: r.code, report: r.report ? { ok: r.report.ok, failure: r.report.failure } : null };
      if (r.code === 0 || (r.report && r.report.ok)) problems.push('a tampered app.asar still runs');
      else log(`tampered app.asar: refused (exit ${r.code}${r.report ? ', ' + r.report.failure : ''})`);
    } finally {
      for (let i = 0; i < 5; i++) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  }
  return { ok: problems.length === 0, problems, results };
}

function summary(r) {
  const s = r.steps;
  return [
    `Electron ${r.versions.electron} / Chromium ${r.versions.chrome}`,
    `emulated lock ${s.emulation.emulated}`,
    `G5 parity ${s.parity.ok ? 'OK' : 'FAIL'} (${s.parity.engine} digest ${s.parity.final.slice(0, 16)}, max position difference ${s.parity.maxDelta.position} m)`,
    `session ${s.session.simulated} s simulated`,
    `export ${s.export.state}`,
    `negative ${Object.values(s.negative).every(Boolean) ? 'all refused' : 'FAIL'}`,
  ].join('; ');
}

async function main() {
  const argv = process.argv.slice(2);
  const exe = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--json');
  if (!exe) {
    console.error('usage: node scripts/desktop-smoke.mjs <LittleBirdTrainer.exe> [--warp] [--tamper] [--json <file>]');
    process.exit(2);
  }
  const r = await smoke(path.resolve(exe), { warp: argv.includes('--warp'), tamper: argv.includes('--tamper') });
  const j = argv.indexOf('--json');
  if (j >= 0) fs.writeFileSync(path.resolve(argv[j + 1]), JSON.stringify(r, null, 1) + '\n');
  for (const p of r.problems) console.error('FAIL ' + p);
  if (!r.ok) process.exit(1);
  console.log('desktop-smoke: OK');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
