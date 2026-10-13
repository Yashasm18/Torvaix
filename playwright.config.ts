import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * End-to-end tests: the real web app and agent server, driven in a browser the way people use
 * Torvaix. A scripted stand-in for Ollama (e2e/fake-model.mjs) plays the model, so runs need no
 * model and always take the same steps.
 *
 * Everything runs on its own ports with its own data folder, so a Torvaix you already have
 * running (and its memories) is left alone.
 *
 *   npm run test:e2e
 *
 * The web app is built and served as in production, so the dev server's file watching and
 * recompiles don't make runs slower or flaky. E2E_SKIP_BUILD=1 reuses an existing build (CI
 * builds just before), and E2E_DEV=1 runs `npm run dev` instead.
 */
const WEB_PORT = Number(process.env.E2E_WEB_PORT) || 3100;
const AGENT_PORT = Number(process.env.E2E_AGENT_PORT) || 3101;
const MODEL_PORT = Number(process.env.E2E_MODEL_PORT) || 11435;
const baseURL = `http://127.0.0.1:${WEB_PORT}`;
const appCommand = process.env.E2E_DEV
  ? 'npm run dev'
  : process.env.E2E_SKIP_BUILD
    ? 'npm start'
    : 'npm run build -w web && npm start';

// Made once, by the process that starts the servers. Test workers only read E2E_HOME.
const home = process.env.E2E_HOME || fs.mkdtempSync(path.join(os.tmpdir(), 'torvaix-e2e-'));
process.env.E2E_HOME = home;

export default defineConfig({
  testDir: './e2e',
  // The tests share one agent server, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/fake-model.mjs',
      url: `http://127.0.0.1:${MODEL_PORT}/api/version`,
      env: { FAKE_MODEL_PORT: String(MODEL_PORT) },
      reuseExistingServer: false,
    },
    {
      command: appCommand,
      url: `${baseURL}/api/system/status`,
      timeout: 300_000,
      reuseExistingServer: false,
      env: {
        PORT: String(WEB_PORT),
        AGENT_PORT: String(AGENT_PORT),
        AGENT_SERVER_URL: `http://127.0.0.1:${AGENT_PORT}`,
        OLLAMA_URL: `http://127.0.0.1:${MODEL_PORT}`,
        // Nothing listens on port 1: vector search and the Python service count as not running.
        QDRANT_URL: 'http://127.0.0.1:1',
        PYTHON_SERVICE_URL: 'http://127.0.0.1:1',
        TORVAIX_HOME: home,
        TORVAIX_MODEL: 'llama3.2',
        // The suite makes more changes and agent runs a minute than the limits a person needs.
        TORVAIX_RATE_LIMIT: '1000',
        TORVAIX_AGENT_RATE_LIMIT: '1000',
      },
    },
  ],
});
