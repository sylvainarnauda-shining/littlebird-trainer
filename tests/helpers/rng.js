'use strict';
// Seeded pseudo-random numbers for deterministic tests (no test may depend on an unseeded draw).
// - lcg(seed): the step function the game's own modules use (Numerical Recipes LCG), as a () => [0, 1) source.
// - withSeededMathRandom(seed, fn): runs fn with Math.random replaced (runtime code paths that still call
//   Math.random: app.js, parts of ground.js, three.js UUIDs), and restores it afterwards, also for an async fn.
// - seedMathRandom(seed): replaces Math.random for the rest of the process (one test file = one process).
// - SEED: the suite seed, fixed by default; the nightly job sets LB_TEST_SEED to explore other draws and prints it.
function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function withSeededMathRandom(seed, fn) {
  const saved = Math.random;
  Math.random = lcg(seed);
  let result;
  try {
    result = fn();
  } catch (error) {
    Math.random = saved;
    throw error;
  }
  if (result && typeof result.then === 'function') {
    return result.finally(() => {
      Math.random = saved;
    });
  }
  Math.random = saved;
  return result;
}

function seedMathRandom(seed) {
  Math.random = lcg(seed);
}

const SEED = Number.parseInt(process.env.LB_TEST_SEED || '20260929', 10);
if (process.env.LB_TEST_SEED) console.log(`LB_TEST_SEED=${SEED}`);

module.exports = { lcg, withSeededMathRandom, seedMathRandom, SEED };
