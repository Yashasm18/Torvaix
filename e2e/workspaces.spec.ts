import { test, expect } from '@playwright/test';
import { openApp, sendChat } from './helpers';

test.describe('Workspaces and projects', () => {
  test('memories stay in the workspace they were saved in', async ({ page }) => {
    await openApp(page, '/knowledge', 'First workspace');
    await page.getByRole('button', { name: 'Add memory' }).click();
    await page.getByLabel('Content').fill('Only the first workspace knows this');
    await page.getByRole('button', { name: 'Save memory' }).click();
    await expect(page.getByText('Only the first workspace knows this')).toBeVisible();

    // Create a second workspace from the switcher; it becomes the active one.
    await page.getByText('First workspace').first().click();
    await page.getByRole('menuitem', { name: 'Create Workspace' }).click();
    await page.getByLabel('Name').fill('Second workspace');
    await page.getByRole('dialog').getByRole('button', { name: 'Create workspace' }).click();
    await expect(page.getByText('Second workspace').first()).toBeVisible();
    await page.goto('/knowledge');
    await expect(page.getByText('Second workspace').first()).toBeVisible();
    await expect(page.getByText('Only the first workspace knows this')).toHaveCount(0);

    // Switching back shows it again.
    await page.getByText('Second workspace').first().click();
    await page.getByRole('menuitem', { name: 'First workspace' }).click();
    await expect(page.getByText('Only the first workspace knows this')).toBeVisible();
  });

  test('a chat is still there after reloading the page', async ({ page }) => {
    await openApp(page, '/chat');
    await sendChat(page, 'Explain reload persistence');
    await expect(page.getByText('Fake model reply: Explain reload persistence')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Fake model reply: Explain reload persistence')).toBeVisible();
  });

  test('creates a project', async ({ page }) => {
    await openApp(page, '/projects');
    await page.getByRole('button', { name: 'New Project' }).click();
    await page.getByLabel('Name').fill('E2E project');
    await page.getByLabel('Description').fill('Made by the end-to-end tests');
    await page.getByRole('button', { name: 'Create Project' }).click();
    await expect(page.getByText('E2E project')).toBeVisible();
  });
});
