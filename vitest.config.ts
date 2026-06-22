import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@torvaix/providers': './packages/providers/src/index.ts',
      '@torvaix/types': './packages/types/src/index.ts',
      '@torvaix/memory': './packages/memory/src/index.ts',
      '@torvaix/router': './packages/router/src/index.ts',
      '@torvaix/mcp': './packages/mcp/src/index.ts',
      '@torvaix/mcp/client': './packages/mcp/src/client.ts',
      '@torvaix/events': './packages/events/src/index.ts',
      '@torvaix/graph': './packages/graph/src/index.ts',
      '@torvaix/agent': './packages/agent/src/index.ts',
    },
  },
});
