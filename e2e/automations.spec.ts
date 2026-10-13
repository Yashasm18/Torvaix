import { test, expect } from '@playwright/test';
import { openApp } from './helpers';

test.describe('Automations', () => {
  test('creates an automation that runs as an agent, runs it, reads its history and pauses it', async ({ page }) => {
    await openApp(page, '/automation');
    await page.getByRole('button', { name: 'New automation' }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Name').fill('E2E file report');
    await form.getByLabel('When it runs').selectOption('manual');
    await form.getByLabel('What it does').selectOption('agent_task');
    await form.getByLabel('Run as').selectOption({ label: 'File assistant' });
    await form.getByLabel('Instructions for the agent').fill('Please create a file named automation-report.txt with text made by an automation');
    await form.getByRole('button', { name: /Create/ }).click();
    // The workspace also has the starter automations, so act on this one's card.
    const card = page.locator('div.group').filter({ has: page.getByRole('heading', { name: 'E2E file report' }) });
    await expect(card).toBeVisible();

    await card.getByRole('button', { name: 'Run now' }).click();
    await card.getByRole('button', { name: 'Logs' }).click();
    const logs = page.getByRole('dialog');
    await expect(logs.getByText('Created automation-report.txt.').first()).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press('Escape');

    await card.getByRole('button', { name: 'Pause Automation' }).click();
    await expect(card.getByRole('button', { name: 'Resume Automation' })).toBeVisible();
  });
});
