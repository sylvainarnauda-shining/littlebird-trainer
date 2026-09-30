// Lint of the repository's own tooling and tests. The imported runtime (src/) is linted from the formatting and lint
// steps of the refactor; the golden recorder (tools/golden/) keeps its bytes, which the goldens pin.
import js from '@eslint/js';
import globals from 'globals';

// Globals a Playwright page.evaluate() callback sees in the trainer page.
const pageGlobals = {
  trainerDiagnostics: 'readonly',
  __app: 'writable',
  HeliPhysics: 'readonly',
  HeliWorld: 'readonly',
  THREE: 'readonly',
};

export default [
  {
    ignores: ['src/**', 'tools/golden/**', 'tests/fixtures/**', 'dist/**', 'test-results/**', 'playwright-report/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.cjs'],
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
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
];
