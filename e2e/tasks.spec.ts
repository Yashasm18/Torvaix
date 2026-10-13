import { test, expect } from '@playwright/test';
import { openApp } from './helpers';

test.describe('Tasks', () => {
  test('a task waiting for approval is listed, and runs once approved', async ({ page }) => {
    await openApp(page, '/tasks');
    await page.getByRole('button', { name: 'New task' }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Instructions').fill('Please run the command `echo task-approved`');
    await form.getByRole('button', { name: 'Run task' }).click();
    await expect(form.getByText(/approval/i).first()).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press('Escape');

    await expect(page.getByText('echo task-approved').first()).toBeVisible();
    await page.getByRole('button', { name: /Approve/ }).first().click();
    await expect(page.getByText(/task-approved/).first()).toBeVisible({ timeout: 60_000 });
  });
});
