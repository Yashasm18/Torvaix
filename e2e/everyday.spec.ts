import { test, expect } from '@playwright/test';
import { openApp, sendChat, watchForErrors } from './helpers';

/** The small things people do all the time: copy a reply, ask again, look at what's remembered. */
test.describe('Everyday chat use', () => {
  test('copies a reply and asks for it again', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = watchForErrors(page);
    await openApp(page, '/chat');
    await sendChat(page, 'Explain copy and regenerate');
    const reply = page.getByText('Fake model reply: Explain copy and regenerate');
    await expect(reply).toBeVisible();

    await page.getByRole('button', { name: 'Copy reply' }).last().click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Fake model reply: Explain copy and regenerate');

    // Regenerate replaces the last reply rather than adding another.
    await page.getByRole('button', { name: 'Regenerate' }).click();
    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible({ timeout: 60_000 });
    await expect(reply).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('keeps the message box usable while a reply is written', async ({ page }) => {
    await openApp(page, '/chat');
    const box = page.getByRole('textbox', { name: 'Message' });
    await box.fill('Explain typing ahead');
    await page.getByRole('button', { name: 'Send message' }).click();
    await box.fill('my next question');
    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible({ timeout: 60_000 });
    await expect(box).toHaveValue('my next question');
  });

  test('shows what Torvaix remembers from the message box, and closes with Escape', async ({ page }) => {
    await openApp(page, '/chat');
    await sendChat(page, 'Remember that the staging server is called kestrel');
    await page.getByRole('button', { name: 'What Torvaix remembers' }).click();
    const panel = page.getByRole('dialog');
    await expect(panel.getByText('staging server is called kestrel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('opens a long command output in full', async ({ page }) => {
    await openApp(page, '/chat');
    await sendChat(page, 'Run the command `seq 1 300`');
    await page.getByRole('button', { name: /^Approve/ }).first().click();
    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible({ timeout: 60_000 });
    const more = page.getByRole('button', { name: /Show all output/ }).last();
    await expect(more).toBeVisible();
    await more.click();
    await expect(page.getByRole('button', { name: 'Show less' }).last()).toHaveAttribute('aria-expanded', 'true');
  });
});

test.describe('Pages', () => {
  test('counts the starter automations everywhere from the first visit', async ({ page }) => {
    await openApp(page, '/workspace');
    const stat = page.locator('a[href="/automation"]').filter({ hasText: 'Active automations' }).first();
    await expect(stat).toContainText(/[1-9]/);
  });

  test('calls the embedding model optional, and offers other models for chat', async ({ page }) => {
    await openApp(page, '/intelligence');
    await expect(page.getByText('Optional: search memories by meaning')).toBeVisible();
    await expect(page.getByText(/Required model/)).toHaveCount(0);
  });
});
