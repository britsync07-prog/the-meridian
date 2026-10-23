import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  snapshotDir: './tests/playwright/snapshots',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'mobile-360', use: { ...devices['Pixel 5'] } },
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev -- --root apps/site',
    port: 4321,
    reuseExistingServer: !process.env.CI,
  },
});
