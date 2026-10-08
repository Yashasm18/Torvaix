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

describe('McpClientManager after the tool server stops', () => {
  it('starts it again for the next call instead of failing with "Not connected"', async () => {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'torvaix-mcp-reconnect-'));
    resetMcpClient();
    const mcp = getMcpClient(workspace);
    try {
      const first = await mcp.callTool('write_file', { filePath: 'a.txt', content: 'one' });
      expect(first.isError).toBeFalsy();

      // The tool server exits while idle (crashed or killed).
      const pid = (mcp as any).transport.pid as number;
      process.kill(pid, 'SIGKILL');
      for (let i = 0; i < 100 && mcp.isConnected(); i++) await new Promise(r => setTimeout(r, 50));
      expect(mcp.isConnected()).toBe(false);

      const second = await mcp.callTool('read_file', { filePath: 'a.txt' });
      expect(second.content[0].text).toBe('one');
    } finally {
      await mcp.close();
      resetMcpClient();
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  }, 30_000);
});
