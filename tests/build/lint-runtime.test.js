'use strict';
// ESLint's determinism rules for the runtime (eslint.config.mjs): every script of src/ is linted except the vendored
// three.js; Math.pow and ** are refused in every form a static rule can see (property, computed property,
// destructuring, through another object, Math held in a variable, passed to a function or read with a computed key,
// the operator and its assignment), the deterministic pow and plain products are accepted, and only src/core/pow.js is
// exempt. What no static rule sees (a string given to eval, for example) is left to the golden recorder, whose game
// realm has a throwing Math.pow. The runtime itself passes (npm run lint runs the same configuration).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ROOT } = require('../helpers/paths');

let eslint;
async function lint(code, file = 'src/probe.js') {
  if (!eslint) {
    const { ESLint } = await import('eslint');
    eslint = new ESLint({ cwd: ROOT });
  }
  const [r] = await eslint.lintText(code, { filePath: path.join(ROOT, file) });
  return r.messages.map((m) => m.ruleId || m.message);
}

test('Math.pow and ** are refused in the runtime, in every form a static rule can see', async () => {
  const refused = [
    'var a=Math.pow(2,3);',
    "var a=Math['pow'](2,3);",
    'var {pow}=Math;',
    'var a=window.Math.pow(2,3);',
    'var a=globalThis.Math;',
    "var a=globalThis['Math'].pow(2,3);",
    // Math held in a variable, read with a computed key, or handed to a function.
    'var M=Math;M.pow(2,3);',
    "var k='pow',a=Math[k](2,3);",
    "var a=Math['p'+'ow'](2,3);",
    "var a=Reflect.get(Math,'pow')(2,3);",
    'var a=(function(m){return m.pow(2,3);})(Math);',
    "var a=Object.getOwnPropertyDescriptor(Math,'pow').value(2,3);",
    'var x=3,a=x**2;',
    'var x=3;x**=2;',
    'var a=(1+1)**0.5;',
  ];
  for (const code of refused) {
    const rules = await lint(code);
    assert.ok(rules.length > 0, 'accepted: ' + code);
    assert.ok(
      rules.every((r) => r === 'no-restricted-properties' || r === 'no-restricted-syntax'),
      code + ': ' + rules.join(', '),
    );
  }
});

test('the deterministic pow, products and GLSL strings are accepted; src/core/pow.js is exempt', async () => {
  const accepted = [
    'var pow=HeliPow.pow,a=pow(2,3),b=HeliPow.pow(2,0.5);',
    'var x=3,a=x*x,b=(x-1)*(x-1);',
    "var s='float y=pow(c,2.);',t=`vec3 c=pow(c,vec3(.41666));`;",
    'var a=Math.sqrt(2)+Math.exp(1)+Math.max(1,2),b=Math.PI*Math.abs(-1);',
  ];
  for (const code of accepted) assert.deepEqual(await lint(code), [], code);
  assert.deepEqual(await lint('var a=Math.pow(2,3),b=2**3;', 'src/core/pow.js'), []);
  assert.ok((await lint('var a=Math.pow(2,3);', 'src/core/other.js')).length > 0, 'only pow.js is exempt');
});

test('every runtime script is linted, the vendored three.js is not', async () => {
  const { ESLint } = await import('eslint');
  const e = new ESLint({ cwd: ROOT });
  for (const f of ['src/app.js', 'src/world.js', 'src/core/pow.js']) assert.equal(await e.isPathIgnored(f), false, f);
  assert.equal(await e.isPathIgnored('src/vendor/three.min.js'), true);
  const results = await e.lintFiles(['src/**/*.js']);
  assert.ok(results.length >= 11, 'runtime scripts linted: ' + results.length);
  const problems = results.flatMap((r) =>
    r.messages.map((m) => `${path.relative(ROOT, r.filePath)}:${m.line} ${m.ruleId}`),
  );
  assert.deepEqual(problems, []);
});
