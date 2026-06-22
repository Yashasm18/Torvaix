import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/src/__tests__/**/*.test.ts'],
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
