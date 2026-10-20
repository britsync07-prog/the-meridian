import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every test file in the repository lives under one of these four roots.
    // `**` matches nested directories, so `shared/config/__tests__/x.test.ts` is covered.
    include: [
      'shared/**/*.test.ts',
      'apps/**/*.test.ts',
      'scripts/**/*.test.ts',
      'spikes/**/*.test.ts',
    ],
    // `include` must never reach into build output or dependency trees.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.astro-cache/**',
      '**/.wrangler/**',
      '**/.git/**',
    ],
    environment: 'node',
    globals: false,
  },
});
