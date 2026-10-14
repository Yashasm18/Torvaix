import { test, expect } from '@playwright/test';
import { openApp } from './helpers';

test.describe('Appearance', () => {
  test('a theme picked in Settings changes the colours and is kept after a reload', async ({ page }) => {
    await openApp(page, '/chat');
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const before = await background();

    await page.getByRole('button', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog');
    await settings.getByRole('tab', { name: /Appearance/ }).click();
    await settings.getByRole('radio', { name: /^Sakura Cherry-blossom/ }).click();
    await expect(settings.getByRole('radio', { name: /^Sakura Cherry-blossom/ })).toHaveAttribute('aria-checked', 'true');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sakura');
    expect(await background()).not.toBe(before);
    expect(await background()).toBe('rgb(255, 247, 250)');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sakura');
  });

  test('"Match my computer" follows the system light or dark setting', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openApp(page, '/chat');
    await page.getByRole('button', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog');
    await settings.getByRole('tab', { name: /Appearance/ }).click();
    await settings.getByRole('radio', { name: /Match my computer/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('an open page sits still: nothing redraws it while nobody is using it', async ({ page }) => {
    await openApp(page, '/projects');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const layouts = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'LayoutCount')!.value;
    await page.waitForTimeout(1500);
    const before = await layouts();
    await page.waitForTimeout(3000);
    // The spinning logo used to lay the page out 60 times a second. Status polling may cause a few.
    expect((await layouts()) - before).toBeLessThan(10);
  });
});
