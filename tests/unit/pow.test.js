'use strict';
// The deterministic pow of the runtime (src/core/pow.js, a port of fdlibm 5.3 e_pow.c with one correction):
//  - every special case of ECMAScript's Number::exponentiate, signed zeros included, on a grid of bases and exponents;
//  - exact results: powers of two, integer ** integer when representable (fdlibm's promise), y = 1, -1, 2, 0.5;
//  - accuracy: below 1 ulp against a 320-bit reference (tests/helpers/bigfloat.js) on a seeded sample of every regime
//    (the game's ranges, the whole exponent range, x near 1 with huge y, subnormal inputs and outputs, negative bases),
//    and against exact rationals for integer exponents;
//  - purity: the file uses no Math.pow, no ** and no other Math function than sqrt and abs, and gives the same doubles
//    in a realm whose Math.pow throws;
//  - the agreement rate with this platform's Math.pow is reported (it is platform-dependent, so only bounded loosely).
// LB_POW_SAMPLES raises the sample size per regime (default 400); the seed is the suite seed (LB_TEST_SEED).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');
const { SRC } = require('../helpers/paths');
const { load } = require('../helpers/runtime');
const { lcg, SEED } = require('../helpers/rng');
const B = require('../helpers/bigfloat');

const { pow } = load('core/pow.js');
const SOURCE = fs.readFileSync(path.join(SRC, 'core', 'pow.js'), 'utf8');
const N = Math.max(50, Number(process.env.LB_POW_SAMPLES) || 400);

const bits = (x) => {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  return dv.getBigInt64(0);
};
const ulpsApart = (a, b) => Number(bits(a) - bits(b));
const same = (a, b, msg) =>
  assert.ok(Object.is(a, b), `${msg}: got ${Object.is(a, -0) ? '-0' : a}, expected ${Object.is(b, -0) ? '-0' : b}`);

// ---------- ECMAScript special cases (ES2025 6.1.6.1.3 Number::exponentiate, steps 1-12) ----------
const isOddIntegral = (y) => Number.isInteger(y) && Math.abs(y % 2) === 1;
// The value the specification fixes, or undefined when it leaves an approximation (step 13).
function specValue(b, e) {
  if (Number.isNaN(e)) return NaN;
  if (e === 0) return 1;
  if (Number.isNaN(b)) return NaN;
  if (b === Infinity) return e > 0 ? Infinity : 0;
  if (b === -Infinity) return e > 0 ? (isOddIntegral(e) ? -Infinity : Infinity) : isOddIntegral(e) ? -0 : 0;
  if (Object.is(b, 0)) return e > 0 ? 0 : Infinity;
  if (Object.is(b, -0)) return e > 0 ? (isOddIntegral(e) ? -0 : 0) : isOddIntegral(e) ? -Infinity : Infinity;
  if (e === Infinity) return Math.abs(b) > 1 ? Infinity : Math.abs(b) === 1 ? NaN : 0;
  if (e === -Infinity) return Math.abs(b) > 1 ? 0 : Math.abs(b) === 1 ? NaN : Infinity;
  if (b < 0 && !Number.isInteger(e)) return NaN;
  return undefined;
}
const BASES = [NaN, Infinity, -Infinity, 0, -0, 1, -1, 0.5, -0.5, 2, -2, 3.7, -3.7, 1 + 2 ** -52, 1 - 2 ** -53];
BASES.push(Number.MIN_VALUE, -Number.MIN_VALUE, 2 ** -1022, Number.MAX_VALUE, -Number.MAX_VALUE, -1 - 2 ** -52);
const EXPONENTS = [NaN, 0, -0, Infinity, -Infinity, 1, -1, 2, -2, 3, -3, 0.5, -0.5, 2.5, -2.5, 1 / 3, 1e300, -1e300];
EXPONENTS.push(2 ** 53, -(2 ** 53), 2 ** 53 - 1, -(2 ** 53 - 1), 2 ** 31 + 1, -(2 ** 31 + 1), 2 ** 64 + 2 ** 12);
EXPONENTS.push(2 ** 31 + 0.5, 1023, -1074, 1e-300, Number.MIN_VALUE);

test('ECMAScript special cases: every fixed result of Number::exponentiate, signed zeros included', () => {
  let fixed = 0;
  for (const b of BASES)
    for (const e of EXPONENTS) {
      const want = specValue(b, e);
      const got = pow(b, e);
      if (want !== undefined) {
        same(got, want, `pow(${b}, ${e})`);
        fixed++;
        continue;
      }
      // Step 13 (an approximation): the sign follows the parity of an integral exponent, and Math.pow is at most
      // two ulps away (both are within one ulp of the exact value).
      const negative = got < 0 || Object.is(got, -0);
      assert.equal(negative, b < 0 && isOddIntegral(e), `sign of pow(${b}, ${e})`);
      const ref = Math.pow(b, e);
      if (Number.isFinite(ref) && Number.isFinite(got) && ref !== 0 && got !== 0)
        assert.ok(Math.abs(ulpsApart(got, ref)) <= 2, `pow(${b}, ${e}) = ${got}, Math.pow ${ref}`);
      else same(got, ref, `pow(${b}, ${e}) at the edge of the range`);
    }
  assert.ok(fixed > 150, 'fixed cases checked: ' + fixed);
});

test('ToNumber of the arguments, as Math.pow (a BigInt throws)', () => {
  same(pow('2', '10'), 1024, 'strings');
  same(pow(true, 3), 1, 'boolean');
  same(pow({ valueOf: () => 3 }, 2), 9, 'valueOf');
  same(pow(undefined, 0), 1, 'undefined ** 0');
  assert.throws(() => pow(2n, 2), TypeError);
});

// ---------- exact results ----------
test('exact results: powers of two over the whole range, y = 1, -1, 2 and 0.5, the rounding at the range ends', () => {
  for (let n = -1074; n <= 1023; n++) same(pow(2, n), 2 ** n, `2 ** ${n}`);
  same(pow(2, 1024), Infinity, '2 ** 1024 overflows');
  same(pow(2, -1075), 0, '2 ** -1075 is a tie, rounded to even (0)');
  same(pow(2, -1074.5), Number.MIN_VALUE, '2 ** -1074.5 rounds up to the smallest subnormal');
  same(pow(2, -1075.5), 0, '2 ** -1075.5 rounds to 0');
  same(pow(4, 511.5), 2 ** 1023, '4 ** 511.5');
  same(pow(4, 512), Infinity, '4 ** 512');
  same(pow(0.5, -1024), Infinity, '0.5 ** -1024');
  same(pow(-2, 1023), -(2 ** 1023), '(-2) ** 1023');
  same(pow(-2, 1025), -Infinity, '(-2) ** 1025');
  same(pow(-0.5, 1075), -0, '(-0.5) ** 1075 underflows to -0');
  same(pow(-1 - 2 ** -30, 2 ** 40 + 1), -Infinity, 'huge odd exponent keeps the sign on overflow');
  same(pow(-1 + 2 ** -30, 2 ** 40 + 1), -0, 'huge odd exponent keeps the sign on underflow');
  const rnd = lcg(SEED);
  for (let i = 0; i < 2000; i++) {
    const x = (rnd() - 0.5) * Math.exp((rnd() - 0.5) * 1400);
    same(pow(x, 1), x, 'x ** 1');
    same(pow(x, -1), 1 / x, 'x ** -1');
    same(pow(x, 2), x * x, 'x ** 2 is the product');
    same(pow(Math.abs(x), 0.5), Math.sqrt(Math.abs(x)), 'x ** 0.5 is the square root');
  }
});

test('integer ** integer is exact whenever the result is representable (fdlibm e_pow.c, "Accuracy")', () => {
  let checked = 0;
  for (let b = 2; b <= 40; b++)
    for (let k = 0; k <= 64; k++) {
      const exact = BigInt(b) ** BigInt(k);
      if (exact > 2n ** 53n) break;
      same(pow(b, k), Number(exact), `${b} ** ${k}`);
      same(pow(-b, k), k % 2 ? -Number(exact) : Number(exact), `(-${b}) ** ${k}`);
      checked++;
    }
  assert.ok(checked > 300, 'cases: ' + checked);
});

test('the constants of e_pow.c: the decimal and hexadecimal forms fdlibm gives are the same doubles', () => {
  const lines = [
    ...SOURCE.matchAll(/fromWords\((0x[0-9A-Fa-f]{8}),(0x[0-9A-Fa-f]{8})\);\s*\/\/ (-?\d\.\d+e[+-]\d+|\d+)/g),
  ];
  assert.ok(lines.length >= 25, 'constants found: ' + lines.length);
  for (const [, h, l, dec] of lines) {
    const dv = new DataView(new ArrayBuffer(8));
    dv.setUint32(0, Number(h));
    dv.setUint32(4, Number(l));
    same(dv.getFloat64(0), Number(dec), `${h} ${l}`);
  }
});

// ---------- accuracy against a 320-bit reference ----------
// Seeded samples per regime: [x, y] pairs with a finite, nonzero result.
function samples() {
  const rnd = lcg(SEED ^ 0x5eed);
  const between = (a, b) => a + (b - a) * rnd();
  const log2 = (x) => Math.log(x) / Math.LN2;
  const R = { game: [], wide: [], nearOne: [], hugeY: [], subnormalX: [], subnormalOut: [], negativeBase: [] };
  for (let i = 0; i < N; i++) {
    // The runtime's own ranges: random draws in (0, 1) to powers 0.6-2.2, slopes, 10 ** (dB / 40), superellipses.
    R.game.push([rnd() || 0.5, between(0.5, 2.5)], [between(0.01, 20), between(0, 5)], [10, between(-1.5, 1.5)]);
    // Any normal x, y chosen so that the result stays normal.
    const x = between(1, 2) * 2 ** Math.floor(between(-1022, 1023));
    const target = between(-1020, 1020);
    if (x !== 1) R.wide.push([x, target / log2(x)]);
    // x within 2**-k of 1, |y| up to 2**31 (the main path) or above (the |y| > 2**31 path).
    const k = Math.floor(between(1, 53));
    const near = 1 + (rnd() < 0.5 ? -1 : 1) * between(0.5, 1) * 2 ** -k;
    if (near !== 1) {
      const y = between(-700, 700) / log2(near);
      (Math.abs(y) > 2 ** 31 ? R.hugeY : R.nearOne).push([near, y]);
    }
    const tiny = between(1, 2) * 2 ** -1000;
    R.hugeY.push([1 + tiny * 2 ** 970, between(-1e11, 1e11)]);
    // Subnormal x; results that fall into the subnormal range.
    // (x >= 2**-1054 with a 32-bit draw: the result stays between 2**-1065 and 2**1002.)
    R.subnormalX.push([(rnd() || 0.5) * 2 ** -1022, between(-0.95, 1.01)]);
    const xs = between(0.1, 100);
    if (xs !== 1) R.subnormalOut.push([xs, between(-1073.5, -1023) / log2(xs)]);
    // Negative base, integral exponent (odd and even): the sign is the parity's, the magnitude |x| ** y.
    R.negativeBase.push([-between(0.01, 50), Math.round(between(-150, 150))]);
  }
  return R;
}

// Errors of a pow implementation over the samples, per regime: max error in ulps, correctly rounded cases, and the
// cases where this platform's Math.pow returns the same double (with the largest distance otherwise, in ulps).
function measure(f) {
  const report = {};
  let worst = { err: 0 };
  for (const [regime, pairs] of Object.entries(samples())) {
    const r = { cases: pairs.length, maxUlp: 0, correctlyRounded: 0, sameAsMathPow: 0, maxUlpsFromMathPow: 0 };
    for (const [x, y] of pairs) {
      const got = f(x, y);
      assert.ok(Number.isFinite(got) && got !== 0, `pow(${x}, ${y}) = ${got} in ${regime}`);
      if (x < 0) assert.equal(got < 0, Math.abs(y) % 2 === 1, `sign of pow(${x}, ${y})`);
      const err = B.ulpError(got, B.powReference(x, y));
      if (err > r.maxUlp) r.maxUlp = err;
      if (err <= 0.5) r.correctlyRounded++;
      if (err > worst.err) worst = { err, x, y, regime };
      const m = Math.pow(x, y);
      if (Object.is(m, got)) r.sameAsMathPow++;
      else r.maxUlpsFromMathPow = Math.max(r.maxUlpsFromMathPow, Math.abs(ulpsApart(m, got)));
    }
    r.maxUlp = +r.maxUlp.toFixed(4);
    report[regime] = r;
  }
  return { report, worst };
}

test('accuracy: under 1 ulp against a 320-bit reference in every regime; agreement with Math.pow reported', (t) => {
  const { report, worst } = measure(pow);
  for (const [regime, r] of Object.entries(report)) assert.ok(r.maxUlp < 1, `${regime}: max error ${r.maxUlp} ulp`);
  const cases = Object.values(report).reduce((n, r) => n + r.cases, 0);
  const agree = Object.values(report).reduce((n, r) => n + r.sameAsMathPow, 0);
  t.diagnostic(`pow accuracy (seed ${SEED}, ${cases} cases): ${JSON.stringify(report)}`);
  t.diagnostic(`worst case: ${JSON.stringify(worst)}`);
  t.diagnostic(
    `agreement with this platform's Math.pow (${process.platform}, Node ${process.version}): ${agree}/${cases} (${((agree / cases) * 100).toFixed(2)} %)`,
  );
});

test("the one deviation from e_pow.c is needed: fdlibm's own 24-bit ivln2_h in the |y| > 2**31 branch is off by up to hundreds of ulps", () => {
  // e_pow.c exactly: the |y| > 2**31 branch with ivln2_h and ivln2_l.
  const faithful = SOURCE.replace('const u=IVLN2_H21*t;', 'const u=IVLN2_H*t;').replace(
    'const v=t*IVLN2_L21-w*IVLN2;',
    'const v=t*IVLN2_L-w*IVLN2;',
  );
  assert.notEqual(faithful, SOURCE);
  const ctx = vm.createContext({});
  vm.runInContext(faithful, ctx);
  const fdlibm = vm.runInContext('HeliPow.pow', ctx);
  const [x, y] = [0.9999998417230332, 2587260676.57459];
  const ref = B.powReference(x, y);
  assert.ok(B.ulpError(fdlibm(x, y), ref) > 100, 'e_pow.c as written');
  assert.ok(B.ulpError(pow(x, y), ref) < 1, 'with the 21-bit split');
  const { report } = measure(fdlibm);
  assert.ok(report.hugeY.maxUlp > 1, 'the |y| > 2**31 samples show it: ' + report.hugeY.maxUlp);
  // Everywhere else the two are the same function.
  for (const pairs of Object.values(samples()))
    for (const [a, b] of pairs) if (Math.abs(b) <= 2 ** 31) same(fdlibm(a, b), pow(a, b), `pow(${a}, ${b})`);
});

test('accuracy: integer exponents against exact rationals (BigInt), under 1 ulp', () => {
  const rnd = lcg(SEED ^ 0x1e7);
  let max = 0;
  for (let i = 0; i < N * 4; i++) {
    const x = (rnd() < 0.5 ? -1 : 1) * (0.05 + rnd() * 30);
    const k = Math.round((rnd() - 0.5) * 60);
    if (k === 0) continue;
    const got = pow(x, k);
    const exact = B.powExact(x, k);
    if (B.cmp(exact, B.OVERFLOW) >= 0 || B.floorLog2(exact) < -1022) continue;
    assert.equal(got < 0, x < 0 && k % 2 !== 0, `sign of ${x} ** ${k}`);
    const err = B.ulpError(got, exact);
    if (err > max) max = err;
    assert.ok(err < 1, `${x} ** ${k}: ${err} ulp`);
  }
  assert.ok(max > 0, 'some results are not exact');
});

test('the reference itself: exact cases and a known value', () => {
  assert.ok(B.ulpError(2 ** -1074, B.powReference(2, -1074)) < 1e-12);
  assert.ok(B.ulpError(1e22, B.powReference(10, 22)) < 1e-12);
  assert.ok(B.ulpError(Math.SQRT2, B.powReference(2, 0.5)) < 0.5);
  assert.ok(B.ulpError(Math.E, B.powReference(Math.E, 1)) < 1e-12);
  // 10 ** -5: the double nearest to 1e-5 is correctly rounded; fdlibm returns its neighbour (under 1 ulp).
  assert.ok(B.ulpError(1e-5, B.powReference(10, -5)) <= 0.5);
  assert.ok(B.ulpError(pow(10, -5), B.powReference(10, -5)) < 1);
});

// ---------- purity ----------
test('purity: no Math.pow, no **, no other Math function than sqrt and abs; same results in a realm without Math.pow', () => {
  const ast = acorn.parse(SOURCE, { ecmaVersion: 'latest', sourceType: 'script' });
  const found = [];
  (function visit(n) {
    if (!n || typeof n.type !== 'string') return;
    if ((n.type === 'BinaryExpression' || n.type === 'AssignmentExpression') && /^\*\*/.test(n.operator))
      found.push('**');
    if (n.type === 'MemberExpression' && n.object.type === 'Identifier' && n.object.name === 'Math') {
      const p = n.computed ? n.property.value : n.property.name;
      if (p !== 'sqrt' && p !== 'abs') found.push('Math.' + p);
    }
    if (n.type === 'Identifier' && ['Date', 'performance', 'Reflect', 'eval', 'Function'].includes(n.name))
      found.push(n.name);
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v.type === 'string') visit(v);
    }
  })(ast);
  assert.deepEqual(found, []);
  // The script as the page runs it (a global HeliPow), in a realm whose Math.pow and Math.random throw.
  const ctx = vm.createContext({});
  vm.runInContext('Math.pow=()=>{throw Error("Math.pow")};Math.random=()=>{throw Error("Math.random")};', ctx);
  vm.runInContext(SOURCE, ctx);
  const other = vm.runInContext('HeliPow', ctx);
  assert.equal(other.source, 'fdlibm 5.3 e_pow.c');
  assert.ok(Object.isFrozen(other));
  const rnd = lcg(SEED);
  for (let i = 0; i < 5000; i++) {
    const x = (rnd() - 0.3) * Math.exp((rnd() - 0.5) * 100);
    const y = rnd() < 0.3 ? Math.round((rnd() - 0.5) * 40) : (rnd() - 0.5) * 20;
    same(other.pow(x, y), pow(x, y), `pow(${x}, ${y}) in another realm`);
  }
});
