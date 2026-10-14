import { test, expect } from '@playwright/test';
import { openApp, sendChat, watchForErrors } from './helpers';

const PAGES = ['/chat', '/workspace', '/projects', '/knowledge', '/graph', '/agents', '/tasks', '/automation', '/intelligence', '/debug/memory', '/debug/context'];

test('every page opens without errors, and the sidebar shows the app is connected', async ({ page }) => {
  const errors = watchForErrors(page);
  await openApp(page, '/chat');
  await expect(page.getByText('Connected')).toBeVisible();
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.getByRole('link', { name: 'Chat' }).first()).toBeVisible();
    await expect(page.getByText(/Something went wrong|Application error/i)).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('the page switcher opens with the keyboard and goes to a page', async ({ page }) => {
  await openApp(page, '/chat');
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByPlaceholder('Go to a page…').fill('Agents');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/agents$/);
});

test.describe('on a phone-sized screen', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('chat works and the menu opens the other pages', async ({ page }) => {
    await openApp(page, '/chat');
    await sendChat(page, 'Explain small screens');
    await expect(page.getByText('Fake model reply: Explain small screens')).toBeVisible();
    await page.getByRole('button', { name: 'Toggle sidebar' }).first().click();
    await page.getByRole('link', { name: 'Knowledge' }).first().click();
    await expect(page).toHaveURL(/\/knowledge$/);
    // The menu closes once a page is picked, so the page itself can be used.
    await expect(page.getByRole('link', { name: 'Knowledge graph' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Add memory' })).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
  });
});
