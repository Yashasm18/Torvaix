import { test, expect } from '@playwright/test';
import { openApp, sendChat } from './helpers';

test.describe('Settings and failures', () => {
  test('shows the model in use and can test the connection to it', async ({ page }) => {
    await openApp(page, '/chat');
    await page.getByRole('button', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog');
    await settings.getByRole('tab', { name: /Models/ }).click();
    // The model in use is "llama3.2"; Ollama lists it as "llama3.2:latest". It is the same model.
    await expect(settings.getByLabel('Model', { exact: true })).toHaveValue('llama3.2:latest');
    await settings.getByRole('button', { name: 'Test' }).click();
    await expect(settings.getByText(/llama3\.2 answered in/)).toBeVisible();
  });

  test('tells the user when the agent server cannot be reached', async ({ page }) => {
    await openApp(page, '/chat');
    await page.route('**/api/chat', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: "The agent server isn't reachable at http://127.0.0.1:3101. Start it with npm run dev." }),
      })
    );
    await page.getByRole('textbox', { name: 'Message' }).fill('Hello?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText(/isn't reachable|Start it with npm run dev/).first()).toBeVisible();
    // The message box works again afterwards.
    await page.unroute('**/api/chat');
    await sendChat(page, 'Explain recovery');
    await expect(page.getByText('Fake model reply: Explain recovery')).toBeVisible();
  });
});
