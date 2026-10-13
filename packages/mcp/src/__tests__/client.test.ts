/**
 * Tests for MCP Client Manager (one cached client per workspace folder)
 */

import { describe, it, expect } from 'vitest';
import { getMcpClient, resetMcpClient } from '../client';

const WORKSPACE = '/tmp/torvaix-test-workspace';

describe('McpClientManager cache', () => {
  it('returns the same instance for the same workspace', () => {
    resetMcpClient();
    const a = getMcpClient(WORKSPACE);
    const b = getMcpClient(WORKSPACE);
    expect(a).toBe(b);
  });

  it('returns a separate instance for each workspace', () => {
    resetMcpClient();
    const a = getMcpClient(WORKSPACE);
    const b = getMcpClient(`${WORKSPACE}-other`);
    expect(a).not.toBe(b);
  });

  it('is not connected initially', () => {
    resetMcpClient();
    const client = getMcpClient(WORKSPACE);
    expect(client.isConnected()).toBe(false);
  });

  it('can reset the cache', () => {
    resetMcpClient();
    const a = getMcpClient(WORKSPACE);
    resetMcpClient();
    const b = getMcpClient(WORKSPACE);
    expect(a).not.toBe(b);
  });
});
