// Frame-rate budgets on the local GPU (npm run test:perf): the browser specs' safety settings, real-time frames.
// Enforced only with LB_PERF=1 on a known machine; otherwise measured and reported.
import base from './playwright.config.mjs';
import { defineConfig } from '@playwright/test';

export default defineConfig({ ...base, testDir: 'tests/perf', outputDir: 'test-results/perf' });
