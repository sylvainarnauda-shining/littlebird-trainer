'use strict';
// Exact and high-precision arithmetic on doubles with BigInt, for the tests of src/core/pow.js:
//  - a double as an exact dyadic rational (m * 2**e);
//  - x**y for x > 0 as E * 2**(n - PREC), with ln and exp evaluated in fixed point with PREC = 320 fractional bits
//    (atanh series for ln, Taylor series for exp after reduction by ln 2): the relative error of the reference is below
//    2**-240 for every |y| < 2**64, far below the half ulp (2**-53) it is compared with;
//  - the error of a double against an exact rational or such a reference, in units in the last place (ulp) of the
//    reference, subnormal ulp included (2**-1074).
const PREC = 320;
const P = BigInt(PREC);
const ONE = 1n << P;

const bitlen = (n) => (n === 0n ? 0 : n.toString(2).length);

// A finite double as {neg, m, e}: |x| = m * 2**e exactly (m a BigInt, 0 for a zero).
function decompose(x) {
  if (!Number.isFinite(x)) throw Error('finite double expected: ' + x);
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  const bits = dv.getBigUint64(0);
  const neg = bits >> 63n === 1n;
  const E = Number((bits >> 52n) & 0x7ffn);
  const F = bits & ((1n << 52n) - 1n);
  return E === 0 ? { neg, m: F, e: -1074 } : { neg, m: F | (1n << 52n), e: E - 1075 };
}

const floorDiv = (a, b) => {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
};
const mulP = (a, b) => (a * b) >> P; // fixed-point product (floors)

// 2 * atanh(z) for a fixed-point 0 <= z <= 1/3.
function twoAtanh(z) {
  const zz = mulP(z, z);
  let term = z;
  let sum = 0n;
  for (let k = 1n; term !== 0n; k += 2n) {
    sum += term / k;
    term = mulP(term, zz);
  }
  return 2n * sum;
}
const LN2 = twoAtanh(ONE / 3n); // ln 2 = 2 atanh(1/3)

// ln(x) of a positive finite double, fixed point.
function lnFixed(x) {
  const { m, e } = decompose(x);
  const L = bitlen(m);
  const half = 1n << BigInt(L - 1); // x = (m / half) * 2**(e + L - 1), m / half in [1, 2)
  const z = ((m - half) << P) / (m + half);
  return twoAtanh(z) + BigInt(e + L - 1) * LN2;
}

// exp(t) for a fixed-point t: {E, n} with exp(t) = E * 2**(n - PREC), E in [2**(PREC-1), 2**(PREC+1)).
function expFixed(t) {
  const n = floorDiv(t + LN2 / 2n, LN2);
  const s = t - n * LN2; // |s| <= ln2 / 2 (up to rounding)
  let term = ONE;
  let sum = ONE;
  for (let k = 1n; term !== 0n; k++) {
    term = mulP(term, s) / k;
    sum += term;
  }
  return { E: sum, n: Number(n) };
}

// Reference of |x|**y for a finite nonzero x and a finite y: {num, den, exp2} with value = num / den * 2**exp2.
function powReference(x, y) {
  const lx = lnFixed(Math.abs(x));
  const { neg, m, e } = decompose(y);
  let t = lx * m;
  t = e >= 0 ? t << BigInt(e) : t >> BigInt(-e);
  if (neg) t = -t;
  const { E, n } = expFixed(t);
  return { num: E, den: 1n, exp2: n - PREC };
}

// Exact |x|**k for a finite nonzero x and an integer k (|k| small): {num, den, exp2}.
function powExact(x, k) {
  const { m, e } = decompose(Math.abs(x));
  const K = BigInt(Math.abs(k));
  const mk = m ** K;
  return k >= 0 ? { num: mk, den: 1n, exp2: e * k } : { num: 1n, den: mk, exp2: -e * Math.abs(k) };
}

// floor(log2(num / den * 2**exp2)) for a positive value.
function floorLog2({ num, den, exp2 }) {
  let l = bitlen(num) - bitlen(den);
  const ge = l >= 0 ? num >= den << BigInt(l) : num << BigInt(-l) >= den;
  if (!ge) l -= 1;
  return l + exp2;
}

// The largest finite double and its rounding boundary, as references: values at or above OVERFLOW round to Infinity.
const OVERFLOW = { num: (1n << 54n) - 1n, den: 1n, exp2: 1024 - 54 }; // 2**1024 - 2**970

// Compare two references: -1, 0 or 1.
function cmp(a, b) {
  const c = Math.min(a.exp2, b.exp2);
  const A = (a.num * b.den) << BigInt(a.exp2 - c);
  const B = (b.num * a.den) << BigInt(b.exp2 - c);
  return A < B ? -1 : A > B ? 1 : 0;
}

// |d - ref| in ulps of the reference (a Number, 2**-64 resolution). d is a finite double of the same sign class
// (its absolute value is compared); a zero d is allowed (the error is then ref / ulp).
function ulpError(d, ref) {
  const { m, e } = decompose(Math.abs(d));
  const u = Math.max(floorLog2(ref) - 52, -1074);
  const c = Math.min(e, ref.exp2, u);
  // In units of 2**c / den: A = m * den * 2**(e - c), B = num * 2**(exp2 - c).
  const A = (m * ref.den) << BigInt(e - c);
  const B = ref.num << BigInt(ref.exp2 - c);
  const D = A > B ? A - B : B - A;
  const scale = ref.den << BigInt(u - c); // one ulp in the same units
  return Number((D << 64n) / scale) / 2 ** 64;
}

module.exports = { PREC, decompose, powReference, powExact, floorLog2, ulpError, cmp, OVERFLOW, bitlen };
