import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 360, height: 720 } });

test('front page snapshots at 360px', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page).toHaveScreenshot('front-360.png');
});

test('front page snapshots at 1280px', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page).toHaveScreenshot('front-1280.png');
});
