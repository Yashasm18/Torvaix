import { expect, type Page } from '@playwright/test';

/**
 * Opens a page of the app the way a new user arrives: on the first visit Torvaix asks for a
 * workspace name. Each test has its own browser storage, so each gets a fresh workspace and its
 * own memories, agents and files on the shared agent server.
 */
export async function openApp(page: Page, path = '/chat', workspaceName = `E2E ${Date.now()}`) {
  await page.goto(path);
  const name = page.getByPlaceholder('e.g. My AI Startup');
  // On a phone-sized screen the sidebar is folded away behind the menu button.
  const app = page
    .getByRole('link', { name: 'Chat' })
    .first()
    .or(page.getByRole('button', { name: 'Toggle sidebar' }).first());
  await expect(name.or(app).first()).toBeVisible({ timeout: 60_000 });
  if (await name.isVisible()) {
    await name.fill(workspaceName);
    await page.getByRole('button', { name: 'Create workspace' }).click();
    await expect(app.first()).toBeVisible();
  }
  if (!page.url().endsWith(path)) await page.goto(path);
}

/**
 * Collects what a user would notice going wrong: uncaught errors, and API calls that fail.
 * Requests to other sites are ignored: they are blocked in some test environments.
 */
export function watchForErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return errors;
}

/** Sends a chat message and waits until the reply has finished. */
export async function sendChat(page: Page, text: string) {
  const box = page.getByRole('textbox', { name: 'Message' });
  await box.fill(text);
  await page.getByRole('button', { name: 'Send message' }).click();
  // While a reply is being written the Stop button replaces Send.
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible({ timeout: 60_000 });
}
