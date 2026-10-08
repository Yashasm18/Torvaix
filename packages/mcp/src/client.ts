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
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.serverPath = path.resolve(__dirname, './index.ts');
    this.workspacePath = workspacePath;
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

    // Start the tool server with this Node binary and tsx's own entry file. Going through `npx`
    // needed a shell to find `npx.cmd` on Windows (so tools never started there) and added a
    // second or two to the first tool call everywhere else.
    this.transport = new StdioClientTransport({
      command: process.execPath,
      args: [require.resolve('tsx/cli'), this.serverPath],
      env: {
        ...process.env,
        TORVAIX_WORKSPACE_PATH: this.workspacePath,
      },
    });

    this.client = new Client(
      { name: 'torvaix-execution-agent', version: '1.0.0' },
      { capabilities: {} }
    );

    // The tool server can exit while idle (crashed or killed). Without this the manager kept
    // handing out the dead connection and every later tool call failed with "Not connected"
    // until the agent server was restarted.
    const client = this.client;
    client.onclose = () => {
      if (this.client === client) this.connected = false;
    };

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
      const message = String(err?.message ?? '');
      // Nothing was sent: the connection was already gone. Connecting again and calling is safe.
      if (message.includes('Not connected')) {
        this.connected = false;
        console.log('[MCP] Tool server was not connected, starting it again...');
        const freshClient = await this.connect();
        const result = await freshClient.callTool({ name, arguments: args });
        return result as McpToolResult;
      }
      // The connection dropped while the tool was running. It may have partly run, so it is not
      // sent again: a shell command the user approved once must not run twice.
      if (message.includes('disconnected') || message.includes('closed')) {
        this.connected = false;
        throw new Error('The tool server stopped while this was running, so its result is unknown. It starts again on the next call.');
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

// ── Instance Cache ──

const _instances = new Map<string, McpClientManager>();

export function getMcpClient(workspacePath: string): McpClientManager {
  let instance = _instances.get(workspacePath);
  if (!instance) {
    instance = new McpClientManager(workspacePath);
    _instances.set(workspacePath, instance);
  }
  return instance;
}

/**
 * Close every cached client, terminating the tool-server child processes they spawned.
 * Without this, each agent-server restart leaves orphaned `tsx` processes behind.
 */
export async function closeAllMcpClients(): Promise<void> {
  const instances = Array.from(_instances.values());
  _instances.clear();
  await Promise.allSettled(instances.map(instance => instance.close()));
}

/** Reset the cache (primarily for testing). */
export function resetMcpClient() {
  _instances.clear();
}
