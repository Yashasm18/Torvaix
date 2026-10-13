import { test, expect } from '@playwright/test';
import { openApp, sendChat, watchForErrors } from './helpers';

test.describe('Chat', () => {
  test('answers a question', async ({ page }) => {
    const errors = watchForErrors(page);
    await openApp(page, '/chat');
    await sendChat(page, 'Explain what a workspace is');
    await expect(page.getByText('Fake model reply: Explain what a workspace is')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('remembers a fact and recalls it in a later message', async ({ page }) => {
    await openApp(page, '/chat');
    await sendChat(page, 'Remember that my favourite framework is Next.js');
    await expect(page.getByText(/saved that/i).first()).toBeVisible();
    await sendChat(page, 'What is my favourite framework?');
    await expect(page.getByText(/From your memories: .*Next\.js/)).toBeVisible();
  });

  test('writes and reads a file in the workspace folder', async ({ page }) => {
    await openApp(page, '/chat');
    await sendChat(page, 'Please create a file named e2e-note.txt with text hello from the e2e test');
    await expect(page.getByText('Created e2e-note.txt.')).toBeVisible();
    await sendChat(page, 'Please read the file e2e-note.txt');
    await expect(page.getByText(/The file says: .*hello from the e2e test/)).toBeVisible();
  });

  test('asks before running a command, and runs it once approved', async ({ page }) => {
    await openApp(page, '/chat');
    await expect(page.getByRole('radio', { name: /Ask every time/i })).toHaveAttribute('aria-checked', 'true');
    await sendChat(page, 'Please run the command `echo e2e-approved`');
    await expect(page.getByText('Security Approval Required')).toBeVisible();
    await page.getByRole('button', { name: 'Approve Execution' }).click();
    // The command's card shows what it printed. (A reply that only repeats that output is hidden.)
    await expect(page.getByText('Ran bash').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('e2e-approved', { exact: true })).toBeVisible();
  });

  test('does not run a command that was denied', async ({ page }) => {
    await openApp(page, '/chat');
    await sendChat(page, 'Please run the command `echo e2e-denied`');
    await expect(page.getByText('Security Approval Required')).toBeVisible();
    await page.getByRole('button', { name: 'Deny' }).click();
    await expect(page.getByText(/denied/i).last()).toBeVisible();
    await expect(page.getByText(/The command printed/)).toHaveCount(0);
  });

  test('in Auto mode runs a read-only command without asking', async ({ page }) => {
    await openApp(page, '/chat');
    await page.getByRole('radio', { name: /Auto/ }).click();
    await sendChat(page, 'Please run the command `pwd`');
    await expect(page.getByText('Ran bash').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Security Approval Required')).toHaveCount(0);
  });
});
