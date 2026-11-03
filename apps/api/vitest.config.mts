import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration files share one Postgres and one Redis container, so files run one at a time.
    fileParallelism: false,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['test/helpers/global-setup.ts'],
          testTimeout: 60_000,
          hookTimeout: 240_000,
        },
      },
    ],
  },
});
