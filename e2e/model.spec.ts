import { test, expect } from '@playwright/test';
import { openApp, sendChat } from './helpers';

// What the stand-in model was asked (see e2e/fake-model.mjs).
const MODEL_URL = `http://127.0.0.1:${Number(process.env.E2E_MODEL_PORT) || 11435}`;
type ModelRequest = { kind: 'router' | 'execution' | 'chat'; stream: boolean; format: string | null; options: Record<string, unknown>; promptChars: number };
const sinceNow = async (request: import('@playwright/test').APIRequestContext) => {
  const before = ((await (await request.get(`${MODEL_URL}/fake/requests`)).json()).requests as ModelRequest[]).length;
  return async () => ((await (await request.get(`${MODEL_URL}/fake/requests`)).json()).requests as ModelRequest[]).slice(before);
};

test.describe('Working with a local model', () => {
  test("doesn't show a thinking model's reasoning in the reply", async ({ page }) => {
    await openApp(page, '/chat');
    await sendChat(page, 'Explain caching');
    await expect(page.getByText('Fake model reply: Explain caching')).toBeVisible();
    await expect(page.getByText('I should answer it')).toHaveCount(0);
    await expect(page.getByText('<think>')).toHaveCount(0);
  });

  test('understands the category when the model answers in a sentence', async ({ page }) => {
    await openApp(page, '/chat');
    // No keyword shortcut covers this; the model's "Category: **knowledge**." decides.
    await sendChat(page, 'My favourite colour is teal');
    await page.goto('/knowledge');
    await expect(page.getByText('My favourite colour is teal').first()).toBeVisible();
  });

  test('asks Ollama for a big enough context window, tool steps ask for JSON, and a long chat stays inside it', async ({ page, request }) => {
    const requests = await sinceNow(request);
    await openApp(page, '/chat');
    const long = 'Here is a long note about the project. '.repeat(80);
    for (let i = 1; i <= 4; i++) await sendChat(page, `Explain part ${i}. ${long}`);
    await sendChat(page, 'Please run the command `echo context-check`');

    const sent = await requests();
    expect(sent.length).toBeGreaterThan(4);
    for (const r of sent) expect(r.options.num_ctx).toBe(8192);
    const chats = sent.filter(r => r.kind === 'chat');
    const steps = sent.filter(r => r.kind === 'execution');
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) expect(step.format).toBe('json');
    for (const chat of chats) expect(chat.format).toBeNull();
    // About 4 characters a token in English: every prompt leaves room for the reply.
    for (const r of sent) expect(r.promptChars / 4).toBeLessThan(8192 - 2048);
  });
});
