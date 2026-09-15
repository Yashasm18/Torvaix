import { defineConfig } from 'vitest/config';
import path from 'path';
import os from 'os';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Graph and workspace folders resolve from TORVAIX_HOME; never let tests write to the user's real home.
    env: { TORVAIX_HOME: path.join(os.tmpdir(), 'torvaix-vitest-home') },
    include: ['packages/**/src/__tests__/**/*.test.ts', 'apps/web/src/**/__tests__/**/*.test.ts'],
  },

  resolve: {
    alias: {
      '@torvaix/providers': path.resolve(__dirname, './packages/providers/src/index.ts'),
      '@torvaix/types': path.resolve(__dirname, './packages/types/src/index.ts'),
      '@torvaix/memory': path.resolve(__dirname, './packages/memory/src/index.ts'),
      '@torvaix/router': path.resolve(__dirname, './packages/router/src/index.ts'),
      '@torvaix/mcp': path.resolve(__dirname, './packages/mcp/src/index.ts'),
      '@torvaix/mcp/client': path.resolve(__dirname, './packages/mcp/src/client.ts'),
      '@torvaix/events': path.resolve(__dirname, './packages/events/src/index.ts'),
      '@torvaix/graph': path.resolve(__dirname, './packages/graph/src/index.ts'),
      '@torvaix/agent': path.resolve(__dirname, './packages/agent/src/index.ts'),
    },
  },
});
