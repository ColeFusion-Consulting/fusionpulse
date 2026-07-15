import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('redirects to /login when accessing protected route', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/login');
    await expect(page.locator('h2')).toContainText('Sign In');
  });

  test('redirects to /login when accessing /monitors', async ({ page }) => {
    await page.goto('/monitors');
    await page.waitForURL('**/login');
    await expect(page.locator('h2')).toContainText('Sign In');
  });

  test('redirects to /login when accessing /tests', async ({ page }) => {
    await page.goto('/tests');
    await page.waitForURL('**/login');
    await expect(page.locator('h2')).toContainText('Sign In');
  });

  test('redirects to /login when accessing /ai', async ({ page }) => {
    await page.goto('/ai');
    await page.waitForURL('**/login');
    await expect(page.locator('h2')).toContainText('Sign In');
  });

  test('redirects to /login when accessing /alerts', async ({ page }) => {
    await page.goto('/alerts');
    await page.waitForURL('**/login');
    await expect(page.locator('h2')).toContainText('Sign In');
  });

  test('redirects to /login when accessing /billing', async ({ page }) => {
    await page.goto('/billing');
    await page.waitForURL('**/login');
    await expect(page.locator('h2')).toContainText('Sign In');
  });

  test('redirects to /login when accessing /settings', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForURL('**/login');
    await expect(page.locator('h2')).toContainText('Sign In');
  });
});

test.describe('Signup', () => {
  test('loads signup page', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('h2')).toContainText('Sign Up');
  });

  test('renders signup form with required fields', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('has link to login from signup page', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('a[href="/login"]')).toBeVisible();
  });
});

test.describe('Login', () => {
  test('renders login form with required fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('has link to signup from login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('a[href="/signup"]')).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'invalid@test.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('[role="alert"]')).toBeVisible();
  });
});
