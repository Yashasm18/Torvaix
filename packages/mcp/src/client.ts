/**
 * Torvaix MCP Client Singleton
 *
 * Manages the lifecycle of the Model Context Protocol client:
 * - Lazy initialization (connects only when first needed)
 * - Persistent connection (reused across agent runs)
 * - Automatic reconnection with exponential backoff
 * - Graceful cleanup on shutdown
 *
 * Usage:
 *   const mcp = await getMcpClient();
 *   const result = await mcp.callTool('bash', { command: 'ls' });
 *   await mcp.close(); // on shutdown
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';

export interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

class McpClientManager {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connecting = false;
  private connected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 3;
  private readonly baseDelayMs = 500;
  private serverPath: string;

  constructor() {
    this.serverPath = path.resolve(__dirname, './index.ts');
  }

  /** Returns true if the client is currently connected. */
  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  /** Lazy-connect to the MCP server. Idempotent — safe to call multiple times. */
  async connect(): Promise<Client> {
    if (this.connected && this.client) return this.client;
    if (this.connecting) {
      // Wait for in-flight connection
      while (this.connecting) {
        await new Promise(r => setTimeout(r, 50));
      }
      if (this.connected && this.client) return this.client;
    }

    this.connecting = true;
    try {
      await this._doConnect();
      this.reconnectAttempts = 0;
      return this.client!;
    } finally {
      this.connecting = false;
    }
  }

  private async _doConnect() {
    // Clean up any stale connection
    await this._cleanup();

    this.transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', this.serverPath],
    });

    this.client = new Client(
      { name: 'torvaix-execution-agent', version: '1.0.0' },
      { capabilities: {} }
    );

    await this.client.connect(this.transport);
    this.connected = true;
    console.log('[MCP] Connected to MCP Server');
  }

  /** Call a tool via MCP. Auto-reconnects if disconnected. */
  async callTool(name: string, args: Record<string, any>): Promise<McpToolResult> {
    const client = await this.connect();

    try {
      const result = await client.callTool({
        name,
        arguments: args,
      });
      return result as McpToolResult;
    } catch (err: any) {
      // If the call failed due to disconnect, try reconnecting once
      if (err.message?.includes('disconnected') || err.message?.includes('closed')) {
        this.connected = false;
        console.log(`[MCP] Connection lost during tool call, reconnecting...`);
        const freshClient = await this.connect();
        const result = await freshClient.callTool({ name, arguments: args });
        return result as McpToolResult;
      }
      throw err;
    }
  }

  /** Gracefully close the connection. */
  async close() {
    await this._cleanup();
    this.reconnectAttempts = 0;
    console.log('[MCP] Connection closed');
  }

  private async _cleanup() {
    this.connected = false;
    if (this.transport) {
      try {
        await this.transport.close();
      } catch (e) {
        // Ignore close errors
      }
      this.transport = null;
    }
    this.client = null;
  }

  /** Attempt reconnection with exponential backoff. */
  async reconnect(): Promise<boolean> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[MCP] Max reconnection attempts (${this.maxReconnectAttempts}) reached`);
      return false;
    }

    this.reconnectAttempts++;
    const delay = this.baseDelayMs * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`[MCP] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    await new Promise(r => setTimeout(r, delay));

    try {
      await this._doConnect();
      this.reconnectAttempts = 0;
      return true;
    } catch (err: any) {
      console.error(`[MCP] Reconnection failed: ${err.message}`);
      return this.reconnect();
    }
  }
}

// ── Singleton Instance ──

let _instance: McpClientManager | null = null;

export function getMcpClient(): McpClientManager {
  if (!_instance) {
    _instance = new McpClientManager();
  }
  return _instance;
}

/** Reset the singleton (primarily for testing). */
export function resetMcpClient() {
  _instance = null;
}
