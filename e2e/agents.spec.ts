import { test, expect } from '@playwright/test';
import { openApp } from './helpers';

test.describe('Agents', () => {
  test('starter agents are there for a new workspace', async ({ page }) => {
    await openApp(page, '/agents');
    for (const name of ['Researcher', 'File assistant', 'Shell helper']) {
      await expect(page.getByRole('button', { name: `Run ${name}` })).toBeVisible();
    }
  });

  test('creates an agent, runs it on a task, edits and deletes it', async ({ page }) => {
    await openApp(page, '/agents');
    await page.getByRole('button', { name: 'New agent' }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Name').fill('Note keeper');
    await form.getByLabel('Instructions').fill('Keep notes in files in the workspace folder.');
    await form.getByRole('checkbox', { name: 'Write files' }).check();
    await form.getByRole('checkbox', { name: 'Read files' }).check();
    await form.getByRole('button', { name: 'Create agent' }).click();
    await expect(page.getByRole('button', { name: 'Run Note keeper' })).toBeVisible();

    await page.getByRole('button', { name: 'Run Note keeper' }).click();
    const run = page.getByRole('dialog');
    await run.locator('textarea').fill('Please create a file named agent-note.txt with text written by an agent');
    await run.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(run.getByText('Created agent-note.txt.').first()).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Edit Note keeper' }).click();
    await page.getByRole('dialog').getByLabel('Name').fill('Note keeper 2');
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('button', { name: 'Run Note keeper 2' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete Note keeper 2' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Delete/ }).click();
    await expect(page.getByRole('button', { name: 'Run Note keeper 2' })).toHaveCount(0);
  });

  test('an agent that may run commands waits for approval, then runs the command', async ({ page }) => {
    await openApp(page, '/agents');
    await page.getByRole('button', { name: 'Run Shell helper' }).click();
    const run = page.getByRole('dialog');
    await run.locator('textarea').fill('Please run the command `echo agent-approved`');
    await run.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(run.getByText('Security Approval Required')).toBeVisible();
    await run.getByRole('button', { name: 'Approve Execution' }).click();
    await expect(run.getByText(/agent-approved/).first()).toBeVisible({ timeout: 60_000 });
    await expect(run.getByText('Done').first()).toBeVisible();
  });

  test('an agent cannot use a tool it was not given', async ({ page }) => {
    await openApp(page, '/agents');
    // The Researcher may only search the web.
    await page.getByRole('button', { name: 'Run Researcher' }).click();
    const run = page.getByRole('dialog');
    await run.locator('textarea').fill('Please run the command `echo should-not-run`');
    await run.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(run.getByText('Done').first()).toBeVisible({ timeout: 60_000 });
    await expect(run.getByText('Security Approval Required')).toHaveCount(0);
    await expect(run.getByText(/should-not-run$/)).toHaveCount(0);
  });
});
