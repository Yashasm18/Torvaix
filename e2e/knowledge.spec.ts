import { test, expect } from '@playwright/test';
import { openApp, sendChat } from './helpers';

test.describe('Knowledge', () => {
  test('adds a memory, finds it, and the chat can use it', async ({ page }) => {
    await openApp(page, '/knowledge');
    await page.getByRole('button', { name: 'Add memory' }).click();
    await page.getByLabel('Content').fill('The staging server runs on port 8443');
    await page.getByLabel('Source').fill('E2E notes');
    await page.getByRole('button', { name: 'Save memory' }).click();
    await expect(page.getByText('The staging server runs on port 8443')).toBeVisible();

    await page.getByPlaceholder('Search memories and themes…').fill('staging');
    await expect(page.getByText('The staging server runs on port 8443')).toBeVisible();

    await page.getByRole('link', { name: 'Chat' }).first().click();
    await sendChat(page, 'Do you remember the staging server port?');
    await expect(page.getByText(/From your memories: .*8443/)).toBeVisible();
  });

  test('deletes a memory', async ({ page }) => {
    await openApp(page, '/knowledge');
    await page.getByRole('button', { name: 'Add memory' }).click();
    await page.getByLabel('Content').fill('A memory that will be deleted');
    await page.getByRole('button', { name: 'Save memory' }).click();
    const memory = page.getByText('A memory that will be deleted');
    await expect(memory).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete memory' }).first().click();
    await expect(memory).toHaveCount(0);
  });
});
