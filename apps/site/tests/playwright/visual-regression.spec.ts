import { test, expect } from '@playwright/test';

test('UK front page matches the approved broadsheet layout', async ({ page }) => {
  await page.goto('/uk/');
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page).toHaveScreenshot('uk-front.png', { fullPage: true, maxDiffPixelRatio: 0.001 });
});
