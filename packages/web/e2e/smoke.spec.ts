import { test, expect } from '@playwright/test';

test('loads login page', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('h2')).toContainText('Sign In');
});
