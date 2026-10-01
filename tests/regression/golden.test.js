'use strict';
// Gates G2a-G2g: every golden suite replayed on src/ with the goldens' own settings equals the recorded fixtures bit
// for bit (tools/golden/record.cjs --check), and the recorder is the one that recorded them ("SAME recorder"). One
// process per suite, several at a time. The goldens are bit-exact on the Node version they were recorded with
// (tests/fixtures/golden/meta.json, pinned in .nvmrc); on another version this test fails with that explanation
// unless LB_GOLDEN_ANY_NODE=1 is set to look at the differences.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, SRC, TEMPLATE, FIXTURES, GOLDEN, RECORDER } = require('../helpers/paths');

const meta = JSON.parse(fs.readFileSync(path.join(GOLDEN, 'meta.json'), 'utf8'));
// Longest first, so the parallel run ends sooner.
const SUITES = [
  'sessions',
  'hud',
  'modules',
  'flight',
  'settings',
  'joystick',
  'world',
  'ui',
  'models',
  'audio',
  'hookapi',
];
const JOBS = Math.max(1, Number(process.env.LB_GOLDEN_JOBS) || Math.min(5, Math.floor(os.availableParallelism() / 2)));

function check(suite) {
  const args = [path.join(RECORDER, 'record.cjs'), '--src', SRC, '--template', TEMPLATE, '--inputs', FIXTURES];
  args.push('--check', GOLDEN, '--suites', suite, '--quiet');
  return new Promise((resolve) => {
    const p = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => resolve({ code, lines: out.split(/\r?\n/).filter((l) => /^(SAME|DIFF) /.test(l)), err }));
  });
}

test('goldens are bit-exact on the Node version they were recorded with', () => {
  if (process.env.LB_GOLDEN_ANY_NODE) return;
  assert.equal(process.version, meta.node, `run the golden suites with Node ${meta.node} (.nvmrc)`);
});

test('every golden suite: SAME recorder and SAME data (G2a-G2g)', { concurrency: JOBS }, async (t) => {
  if (process.version !== meta.node && !process.env.LB_GOLDEN_ANY_NODE) {
    t.skip(`Node ${process.version} instead of ${meta.node}`);
    return;
  }
  await Promise.all(
    SUITES.map((suite) =>
      t.test(suite, async () => {
        const r = await check(suite);
        const detail = r.lines.join('\n') + (r.err ? '\n' + r.err.slice(-1500) : '');
        assert.equal(r.code, 0, detail);
        assert.ok(
          r.lines.includes('SAME recorder'),
          'the recorder differs from the one that recorded the goldens\n' + detail,
        );
        assert.ok(r.lines.includes('SAME ' + suite), detail);
        if (suite === 'flight') assert.ok(r.lines.includes('SAME parity'), detail);
        assert.ok(!r.lines.some((l) => l.startsWith('DIFF')), detail);
      }),
    ),
  );
});
