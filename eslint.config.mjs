// Lint of the repository's own tooling and tests, and one rule set for the runtime (src/). The runtime's full lint comes
// with the formatting and lint steps of the refactor; until then src/ is checked only for what makes its results
// platform-dependent. The golden recorder (tools/golden/) keeps its bytes, which the goldens pin.
import js from '@eslint/js';
import globals from 'globals';

// Globals a Playwright page.evaluate() callback sees in the trainer page.
const pageGlobals = {
  trainerDiagnostics: 'readonly',
  __app: 'writable',
  HeliPhysics: 'readonly',
  HeliWorld: 'readonly',
  HeliSettingsData: 'readonly',
  HeliSettings: 'readonly',
  HeliMenus: 'readonly',
  THREE: 'readonly',
};

// Math.pow and ** round differently on different platforms (V8 calls the C library's pow): the runtime computes powers
// with the deterministic HeliPow.pow of src/core/pow.js, and integer squares as a product (x*x, docs/FIDELITE.md).
// Math is only ever used as Math.<name>: a Math reached through another object, held in a variable or passed to a
// function, and a computed member of Math, would let Math.pow through unseen. What no static rule can see (a string
// given to eval, for example) is caught when it runs: the golden recorder's game realm has a Math.pow that throws.
const POW_MESSAGE =
  'Math.pow and ** differ between platforms: use pow from src/core/pow.js (HeliPow.pow), or x*x for a square.';
const MATH_MESSAGE = 'Use Math only as Math.<name> (any other use of Math can reach Math.pow unseen).';
export const runtimeDeterminism = {
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'pow', message: POW_MESSAGE },
    { property: 'Math', message: 'Reach Math directly (a Math reached through an object escapes the pow rule).' },
  ],
  'no-restricted-syntax': [
    'error',
    { selector: "BinaryExpression[operator='**']", message: POW_MESSAGE },
    { selector: "AssignmentExpression[operator='**=']", message: POW_MESSAGE },
    {
      selector: "MemberExpression[object.type='Identifier'][object.name='Math'][computed=true]",
      message: MATH_MESSAGE,
    },
    {
      selector: "Identifier[name='Math']:not(MemberExpression[computed=false] > Identifier.object)",
      message: MATH_MESSAGE,
    },
  ],
};

export default [
  {
    ignores: [
      'src/vendor/**',
      'tools/golden/**',
      'tests/fixtures/**',
      'dist/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  { ...js.configs.recommended, ignores: ['src/**'] },
  {
    files: ['**/*.js', '**/*.cjs'],
    ignores: ['src/**'],
    languageOptions: { sourceType: 'commonjs', ecmaVersion: 2025, globals: { ...globals.node } },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module', ecmaVersion: 2025, globals: { ...globals.node } },
  },
  {
    files: ['tests/browser/**'],
    languageOptions: { globals: { ...globals.browser, ...pageGlobals } },
  },
  {
    ignores: ['src/**'],
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  // The runtime: classic scripts sharing the page's global scope; only the determinism rules for now.
  {
    files: ['src/**/*.js'],
    languageOptions: { sourceType: 'script', ecmaVersion: 2025 },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: runtimeDeterminism,
  },
  // The pow module itself is exempt (it implements the rule's replacement; tests/unit/pow.test.js checks that it
  // uses no Math.pow and no ** all the same).
  {
    files: ['src/core/pow.js'],
    rules: { 'no-restricted-properties': 'off', 'no-restricted-syntax': 'off' },
  },
];
