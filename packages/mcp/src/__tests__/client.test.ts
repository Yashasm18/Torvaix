/**
 * Tests for MCP Client Manager (Singleton)
 */

import { describe, it, expect } from 'vitest';
import { getMcpClient, resetMcpClient } from '../client';

describe('McpClientManager Singleton', () => {
  it('returns singleton instance', () => {
    resetMcpClient();
    const a = getMcpClient();
    const b = getMcpClient();
    expect(a).toBe(b);
  });

  it('is not connected initially', () => {
    resetMcpClient();
    const client = getMcpClient();
    expect(client.isConnected()).toBe(false);
  });

  it('can reset singleton', () => {
    resetMcpClient();
    const a = getMcpClient();
    resetMcpClient();
    const b = getMcpClient();
    expect(a).not.toBe(b);
  });
});
