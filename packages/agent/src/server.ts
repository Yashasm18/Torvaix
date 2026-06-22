/**
 * Torvaix Agent Server
 *
 * Hardened Express server with:
 * - SQLite-backed user persistence (bcrypt password hashing)
 * - JWT session management
 * - Rate limiting
 * - Auth middleware on protected routes
 * - All existing APIs preserved: agent, memory, companion
 */

import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AgentOrchestrator } from './orchestrator';
import { MemoryStore } from '@torvaix/memory';
import { LLMClient } from '@torvaix/providers';

// ── Environment & Config ──

const JWT_SECRET = process.env.JWT_SECRET ?? (() => {
  const secret = crypto.randomBytes(64).toString('hex');
  console.warn('[Auth] JWT_SECRET not set — using random secret. Sessions will not persist across restarts!');
  return secret;
})();

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60; // requests per window per user
const AGENT_RATE_LIMIT_MAX = 30; // stricter for agent runs

// ── App Setup ──

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const memoryDbPath = path.join(process.cwd(), 'torvaix_metadata.db');
const memoryStore = new MemoryStore(memoryDbPath);
const llmClient = new LLMClient();

app.use(express.json({ limit: '50mb' }));

// CORS for local dev (Next.js on 3000, agent server on 3001)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Auth Types ──

interface AuthRequest extends Request {
  user?: { userId: string; email: string };
}

// ── Rate Limiting ──

interface RateLimitEntry {
  requests: number[]; // timestamps
}

const rateLimits = new Map<string, RateLimitEntry>();

function rateLimit(maxRequests: number = RATE_LIMIT_MAX) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const key = req.user?.userId ?? req.ip ?? 'anonymous';
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;

    let entry = rateLimits.get(key);
    if (!entry) {
      entry = { requests: [] };
      rateLimits.set(key, entry);
    }

    // Clean old requests
    entry.requests = entry.requests.filter(t => t > windowStart);

    if (entry.requests.length >= maxRequests) {
      res.status(429).json({ error: 'Rate limit exceeded. Please slow down.' });
      return;
    }

    entry.requests.push(now);
    next();
  };
}

// ── Auth Middleware ──

function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Provide a Bearer token.' });
    return;
  }

  try {
    const token = header.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET, { clockTolerance: 60 }) as any;
    req.user = { userId: decoded.userId, email: decoded.email };
    next();
  } catch (err: any) {
    res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }
}

// ── Public Routes ──

// Health check (no auth required)
app.get('/api/health', async (_req, res) => {
  const qdrantOk = await memoryStore.initQdrant();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: { sqlite: true, qdrant: qdrantOk },
    version: '0.1.0',
  });
});

// ── Auth Routes ──

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      res.status(400).json({ error: 'Missing required fields: username, email, password' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    // Check if email exists
    const existing = memoryStore.getUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    const userId = memoryStore.createUser(username, email, hash);
    memoryStore.createWorkspace('Default Workspace', { userId });

    const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, userId, username });
  } catch (error: any) {
    console.error('[Auth] Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Missing email or password' });
      return;
    }

    const user = memoryStore.getUserByEmail(email);
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    memoryStore.touchUserLogin(user.id);

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId: user.id, username: user.username });
  } catch (error: any) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
  const user = memoryStore.getUserById(req.user!.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ userId: user.id, username: user.username, email: user.email });
});

// ── Protected Routes ──

app.post('/api/conversations', requireAuth, rateLimit(), (req: AuthRequest, res) => {
  try {
    const { workspaceId, title = 'New Conversation' } = req.body;
    const conversationId = memoryStore.createConversation(workspaceId ?? 'default', title);
    res.status(201).json({ id: conversationId, title });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Agent loop — stricter rate limit
app.post('/api/agent/run', requireAuth, rateLimit(AGENT_RATE_LIMIT_MAX), async (req: AuthRequest, res) => {
  try {
    const { instructions, workspaceId, messages = [], pendingActionId } = req.body;
    const isStream = req.query.stream === 'true';

    if (isStream) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
    }

    const orchestrator = new AgentOrchestrator(memoryStore, {
      llm: llmClient,
      model: process.env.TORVAIX_MODEL,
    });

    // If resuming from approval, the orchestrator needs to know
    if (pendingActionId) {
      const pending = memoryStore.getPendingAction(pendingActionId);
      if (pending) {
        orchestrator.approveTool(pending.action, pending.workspaceId);
      }
    }

    const finalState = await orchestrator.run(
      {
        workspaceId: workspaceId ?? 'default',
        instructions,
        messages,
        pendingActionId,
      },
      isStream ? ((chunk: string) => res.write(chunk)) : undefined
    );

    if (isStream) {
      let outputText = finalState.output;
      if (finalState.pendingActionId) {
        outputText = `\n\n**SECURITY LAYER TRIGGERED**\nThe agent wants to execute a potentially dangerous action.\nPending Action ID: \`${finalState.pendingActionId}\``;
      }
      res.write(`0:${JSON.stringify(outputText)}\n`);
      res.end();
    } else {
      res.json({
        status: finalState.pendingActionId ? 'pending_confirmation' : 'completed',
        output: finalState.output,
        messages: finalState.messages,
        pendingActionId: finalState.pendingActionId,
      });
    }
  } catch (error: any) {
    console.error('Agent error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Agent loop failed', details: error.message });
    } else {
      res.end(`\n\nError: Agent loop failed - ${error.message}`);
    }
  }
});

// Approve Pending Action
app.post('/api/agent/approve', requireAuth, rateLimit(), (req: AuthRequest, res) => {
  try {
    const { pendingActionId, status } = req.body as { pendingActionId: string; status: 'approved' | 'rejected' };
    if (!pendingActionId || !status) {
      res.status(400).json({ error: 'Missing pendingActionId or status' });
      return;
    }
    memoryStore.updatePendingActionStatus(pendingActionId, status);
    res.json({ success: true, status });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update pending action' });
  }
});

// Direct memory endpoints
app.post('/api/memory/store', requireAuth, rateLimit(), async (req: AuthRequest, res) => {
  try {
    const { workspaceId, content, source } = req.body;
    const id = await memoryStore.storeMemory(workspaceId ?? 'default', content, source ?? 'API');
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to store memory', details: error.message });
  }
});

app.post('/api/memory/query', requireAuth, rateLimit(), async (req: AuthRequest, res) => {
  try {
    const { workspaceId, query, topK } = req.body;
    const results = await memoryStore.queryMemory(workspaceId ?? 'default', query, topK ?? 5);
    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to query memory', details: error.message });
  }
});

// ── Companion Layer (Experimental) — preserved as-is ──

app.post('/api/companion/pair/create', requireAuth, async (req, res) => {
  try {
    const { scope = 'readonly', expiryMinutes = 10 } = req.body;
    console.log('[EXPERIMENTAL][Companion] Creating pairing token...');
    const result = memoryStore.createPairingToken(scope, expiryMinutes);
    res.status(201).json({
      success: true,
      pairingToken: result.token,
      scope,
      expiresInMinutes: expiryMinutes,
      experimental: true,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create pairing token', details: error.message });
  }
});

app.post('/api/companion/pair/claim', async (req, res) => {
  try {
    const { token, deviceName, fingerprint } = req.body;
    if (!token || !deviceName || !fingerprint) {
      res.status(400).json({ error: 'Missing required fields: token, deviceName, fingerprint' });
      return;
    }
    console.log(`[EXPERIMENTAL][Companion] Device "${deviceName}" attempting to pair...`);
    const deviceId = memoryStore.claimPairingToken(token, deviceName, fingerprint);
    if (!deviceId) {
      res.status(401).json({ error: 'Invalid, expired, or already-claimed pairing token' });
      return;
    }
    const sessionToken = memoryStore.createDeviceSession(deviceId);
    res.json({ success: true, deviceId, sessionToken, experimental: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Pairing failed', details: error.message });
  }
});

app.post('/api/companion/session', async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) { res.status(400).json({ error: 'Missing deviceId' }); return; }
    const sessionToken = memoryStore.createDeviceSession(deviceId);
    if (!sessionToken) { res.status(401).json({ error: 'Device not found or revoked' }); return; }
    res.json({ success: true, sessionToken, experimental: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Session creation failed', details: error.message });
  }
});

app.post('/api/companion/session/validate', async (req, res) => {
  try {
    const { sessionToken } = req.body;
    if (!sessionToken) { res.status(400).json({ error: 'Missing sessionToken' }); return; }
    const session = memoryStore.validateSession(sessionToken);
    if (!session) { res.status(401).json({ error: 'Invalid or expired session' }); return; }
    res.json({
      success: true,
      ...session,
      capabilities: session.scope === 'admin'
        ? ['read', 'write', 'execute', 'memory', 'workspaces']
        : ['read', 'memory'],
      experimental: true,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Session validation failed', details: error.message });
  }
});

app.get('/api/companion/devices', requireAuth, async (_req, res) => {
  try {
    const devices = memoryStore.listCompanionDevices();
    res.json({ success: true, devices, experimental: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list devices', details: error.message });
  }
});

app.post('/api/companion/devices/revoke', requireAuth, async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) { res.status(400).json({ error: 'Missing deviceId' }); return; }
    memoryStore.revokeDevice(deviceId);
    res.json({ success: true, message: 'Device revoked', experimental: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to revoke device', details: error.message });
  }
});

// ── WebSocket (preserved) ──

const activeConnections = new Map<string, any>();

wss.on('connection', (ws: any) => {
  const connectionId = crypto.randomBytes(16).toString('hex');
  activeConnections.set(connectionId, ws);

  ws.on('message', async (message: string) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'join_conversation') {
        ws.conversationId = data.conversationId;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    activeConnections.delete(connectionId);
  });
});

// ── Startup ──

const PORT = process.env.AGENT_PORT || 3001;
server.listen(PORT, () => {
  console.log(`Torvaix Agent Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Auth:         http://localhost:${PORT}/api/auth/register | /api/auth/login`);
  console.log(`Agent API:    http://localhost:${PORT}/api/agent/run`);
  console.log(`Memory API:   http://localhost:${PORT}/api/memory/store`);
  console.log(`Companion:    http://localhost:${PORT}/api/companion/pair/create [EXPERIMENTAL]`);
});

export default app;
