import { test, expect } from '@playwright/test';

test('UK front page matches the approved broadsheet layout', async ({ page }) => {
  await page.goto('/uk/');
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page).toHaveScreenshot('uk-front.png', { fullPage: true, maxDiffPixelRatio: 0.001 });
});

test('section pages render their stories in the active edition', async ({ page }) => {
  await page.goto('/uk/politics/');
  await expect(page.locator('main h1')).toHaveText('Politics');
  await expect(page.locator('a[href^="/uk/story/"]').first()).toBeVisible();
});
