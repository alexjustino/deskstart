import { defineConfig } from 'vitest/config';

/**
 * The end-to-end suite: the real binary, driven through WebDriver.
 *
 * Separate from the unit configuration because it needs a built application
 * and a matching `msedgedriver`, and because it runs one file at a time — each
 * file owns one application process and one workspace, and two would fight
 * over the driver port.
 */
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.ts'],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 60_000,
    hookTimeout: 120_000,
    reporters: ['verbose'],
  },
});
