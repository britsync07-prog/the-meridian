import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: './tests/playwright',
  snapshotDir: './tests/playwright/snapshots',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
          args: ['--disable-extensions', '--disable-component-extensions-with-background-pages'],
        }
      : undefined,
  },
  projects: [
    { name: 'mobile-360', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 720 } } },
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
  ],
  webServer: {
    command: 'npm run dev',
    cwd: '../..',
    port: 4321,
    reuseExistingServer: !process.env.CI,
    env: { SNAPSHOT_PATH: resolve('apps/site/__fixtures__/publication-snapshot.json') },
  },
});
