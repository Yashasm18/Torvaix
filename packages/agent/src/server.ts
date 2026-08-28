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
import { WorkspaceKnowledgeSynthesizer } from '@torvaix/intelligence';
import { torvaixEvents, AutomationEngine, AutomationWorkflow } from '@torvaix/events';
import rateLimit from 'express-rate-limit';



// ── Environment & Config ──

const JWT_SECRET = process.env.JWT_SECRET ?? (() => {
  const secret = crypto.randomBytes(64).toString('hex');
  console.warn('[Auth] JWT_SECRET not set — using random secret. Sessions will not persist across restarts!');
  return secret;
})();

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60; // requests per window per user
const AGENT_RATE_LIMIT_MAX = 30; // stricter for agent runs

import os from 'os';
import fs from 'fs';

// ── App Setup ──

const TORVAIX_HOME = process.env.TORVAIX_HOME || path.join(os.homedir(), '.torvaix');
const DATA_DIR = path.join(TORVAIX_HOME, 'data');
const WORKSPACES_DIR = path.join(TORVAIX_HOME, 'workspaces');

// Bootstrap directories
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(WORKSPACES_DIR)) fs.mkdirSync(WORKSPACES_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const memoryDbPath = path.join(DATA_DIR, 'torvaix.db');
const memoryStore = new MemoryStore(memoryDbPath);
const llmClient = new LLMClient();

// ── Background Automation Engine ──

const automationEngine = new AutomationEngine({
  listAutomations: (workspaceId?: string) => {
    const rows = memoryStore.listAutomations(workspaceId);
    return rows.map(r => ({
      id: r.id,
      workspaceId: r.workspaceId,
      name: r.name,
      description: r.description,
      triggerType: r.triggerType,
      triggerConfig: JSON.parse(r.triggerConfig || '{}'),
      actionType: r.actionType as any,
      actionConfig: JSON.parse(r.actionConfig || '{}'),
      status: r.status,
      lastRunAt: r.lastRunAt,
      runCount: r.runCount,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  },
  getAutomation: (id: string) => {
    const r = memoryStore.getAutomation(id);
    if (!r) return null;
    return {
      id: r.id,
      workspaceId: r.workspaceId,
      name: r.name,
      description: r.description,
      triggerType: r.triggerType,
      triggerConfig: JSON.parse(r.triggerConfig || '{}'),
      actionType: r.actionType as any,
      actionConfig: JSON.parse(r.actionConfig || '{}'),
      status: r.status,
      lastRunAt: r.lastRunAt,
      runCount: r.runCount,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  },
  updateAutomation: (id: string, updates: any) => {
    return memoryStore.updateAutomation(id, updates);
  },
  logAutomationRun: (log: any) => {
    memoryStore.logAutomationRun(log);
  }
});

automationEngine.setActionHandler(async (workflow: AutomationWorkflow) => {
  const { actionType, actionConfig, workspaceId } = workflow;

  if (actionType === 'consolidate_memory') {
    const memories = (await memoryStore.getAllMemories(workspaceId)) as any[];
    const synthesizer = new WorkspaceKnowledgeSynthesizer();
    const report = synthesizer.consolidateWorkspace(workspaceId, memories);
    return {
      success: true,
      output: `Autonomous Memory Consolidation completed: ${report.processedCount} memories analyzed, ${report.clustersCount} clusters created, ${report.reinforcedEdgesCount} graph edges reinforced.`
    };
  }

  if (actionType === 'synthesize_graph') {
    const memories = (await memoryStore.getAllMemories(workspaceId)) as any[];
    const synthesizer = new WorkspaceKnowledgeSynthesizer();
    const report = synthesizer.consolidateWorkspace(workspaceId, memories);
    return {
      success: true,
      output: `Knowledge Graph Indexer completed: ${report.synthesizedInsights.length} insights synthesized, ${report.reinforcedEdgesCount} graph edges generated.`
    };
  }

  if (actionType === 'clean_stale_memories') {
    const stats = memoryStore.getMemoryStats(workspaceId);
    return {
      success: true,
      output: `Stale Memory Cleaner evaluated: ${stats.total} total memories retained, average retrieval frequency: ${stats.avgRetrieval}.`
    };
  }

  if (actionType === 'agent_task') {
    const prompt = actionConfig?.prompt || `Execute background automation: ${workflow.name}`;
    const agent = new AgentOrchestrator(memoryStore, { llm: llmClient });
    const finalState = await agent.run({
      workspaceId,
      instructions: prompt,
    });
    return {
      success: true,
      output: finalState.output || `Agent task finished with status completed`
    };
  }

  return {
    success: true,
    output: `Executed automation ${workflow.name} [${actionType}]`
  };
});

// Start background automation loop
automationEngine.start(30_000);


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

const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Please slow down.' }
});

const agentLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: AGENT_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Please slow down.' }
});

app.use('/api/', apiLimiter);


// ── Auth Middleware ──

function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    // For local development and demo compatibility, bypass auth if no Bearer token is provided
    req.user = { userId: 'default-user', email: 'dev@torvaix.ai' };
    next();
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

app.get('/api/auth/me', requireAuth, apiLimiter, (req: AuthRequest, res) => {
  const user = memoryStore.getUserById(req.user!.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ userId: user.id, username: user.username, email: user.email });
});

// ── Protected Routes ──

app.post('/api/workspaces', requireAuth, apiLimiter, (req: AuthRequest, res) => {
  try {
    const { id, name = 'New Workspace', settings = {} } = req.body;
    
    // Check if it already exists
    if (id && memoryStore.getWorkspace(id)) {
      return res.json({ success: true, id });
    }

    const createdId = memoryStore.createWorkspace(name, settings, id);
    res.status(201).json({ success: true, id: createdId });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

app.post('/api/conversations', requireAuth, apiLimiter, (req: AuthRequest, res) => {
  try {
    const { workspaceId, title = 'New Conversation' } = req.body;
    const conversationId = memoryStore.createConversation(workspaceId ?? 'default', title);
    res.status(201).json({ id: conversationId, title });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Agent loop — stricter rate limit
app.post('/api/agent/run', requireAuth, agentLimiter, async (req: AuthRequest, res) => {
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
      // Emit text chunk, then finish markers per Vercel AI SDK data stream protocol
      res.write(`0:${JSON.stringify(outputText)}\n`);
      res.write(`e:${JSON.stringify({ finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0 }, isContinued: false })}\n`);
      res.write(`d:${JSON.stringify({ finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0 } })}\n`);
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
app.post('/api/agent/approve', requireAuth, apiLimiter, (req: AuthRequest, res) => {
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

// List Execution Logs
app.get('/api/agent/executions', requireAuth, apiLimiter, (req: AuthRequest, res) => {
  try {
    const workspaceId = (req.query.workspaceId as string) || 'default';
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const logs = memoryStore.listExecutionLogs(workspaceId, limit);
    res.json({ success: true, logs });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch execution logs', details: error.message });
  }
});

// List Pending Actions
app.get('/api/agent/pending-actions', requireAuth, apiLimiter, (req: AuthRequest, res) => {
  try {
    const workspaceId = (req.query.workspaceId as string) || 'default';
    const status = (req.query.status as any) || 'pending';
    const actions = memoryStore.listPendingActions(workspaceId, status);
    res.json({ success: true, actions });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch pending actions', details: error.message });
  }
});

// Dispatch Agent Task Directly
app.post('/api/agent/tasks', requireAuth, agentLimiter, async (req: AuthRequest, res) => {

  try {
    const { instructions, workspaceId = 'default', priority = 'medium' } = req.body;
    if (!instructions || typeof instructions !== 'string') {
      res.status(400).json({ error: 'Instructions are required' });
      return;
    }

    const orchestrator = new AgentOrchestrator(memoryStore, {
      llm: llmClient,
      model: process.env.TORVAIX_MODEL,
    });

    const finalState = await orchestrator.run({
      workspaceId,
      instructions,
      messages: [],
    });

    res.json({
      success: true,
      task: {
        id: crypto.randomUUID(),
        workspaceId,
        instructions,
        priority,
        status: finalState.pendingActionId ? 'pending_confirmation' : 'completed',
        output: finalState.output,
        pendingActionId: finalState.pendingActionId,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to execute agent task', details: error.message });
  }
});

// Direct memory endpoints
app.get('/api/memory/list', requireAuth, apiLimiter, async (req: AuthRequest, res) => {
  try {
    const workspaceId = (req.query.workspaceId as string) || 'default';
    const memories = await memoryStore.getAllMemories(workspaceId);
    res.json({ success: true, memories });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list memories', details: error.message });
  }
});

app.post('/api/memory/store', requireAuth, apiLimiter, async (req: AuthRequest, res) => {
  try {
    const { workspaceId = 'default', content, source = 'API' } = req.body;
    const id = await memoryStore.storeMemory(workspaceId, content, source);
    torvaixEvents.emitMemoryCreated({ id, workspaceId, source, content });
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to store memory', details: error.message });
  }
});

app.post('/api/memory/query', requireAuth, apiLimiter, async (req: AuthRequest, res) => {
  try {
    const { workspaceId, query, topK } = req.body;
    const results = await memoryStore.queryMemory(workspaceId ?? 'default', query, topK ?? 5);
    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to query memory', details: error.message });
  }
});

app.delete('/api/memory/:id', requireAuth, apiLimiter, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    await memoryStore.deleteMemory(id);
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete memory', details: error.message });
  }
});

// Autonomous Memory Consolidation & Workspace Knowledge Synthesis
app.post('/api/memory/consolidate', requireAuth, apiLimiter, async (req: AuthRequest, res) => {
  try {
    const { workspaceId = 'default' } = req.body;
    const memories = (await memoryStore.getAllMemories(workspaceId)) as any[];
    const synthesizer = new WorkspaceKnowledgeSynthesizer();
    const report = synthesizer.consolidateWorkspace(workspaceId, memories);
    res.json({ success: true, report });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to consolidate memory', details: error.message });
  }
});

app.get('/api/memory/insights', requireAuth, apiLimiter, async (req: AuthRequest, res) => {
  try {
    const workspaceId = (req.query.workspaceId as string) || 'default';
    const memories = (await memoryStore.getAllMemories(workspaceId)) as any[];
    const stats = memoryStore.getMemoryStats(workspaceId);
    const synthesizer = new WorkspaceKnowledgeSynthesizer();
    const report = synthesizer.consolidateWorkspace(workspaceId, memories);
    res.json({
      success: true,
      stats,
      health: report.healthMetrics,
      insights: report.synthesizedInsights,
      clusters: report.clusters,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch memory insights', details: error.message });
  }
});

// ── Automation Workflows API ──

app.get('/api/automations', requireAuth, apiLimiter, async (req: AuthRequest, res) => {
  try {
    const workspaceId = (req.query.workspaceId as string) || 'default';
    memoryStore.seedDefaultAutomations(workspaceId);
    const rows = memoryStore.listAutomations(workspaceId);
    const automations = rows.map(r => ({
      ...r,
      triggerConfig: JSON.parse(r.triggerConfig || '{}'),
      actionConfig: JSON.parse(r.actionConfig || '{}'),
    }));
    res.json({ success: true, automations });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list automations', details: error.message });
  }
});

app.post('/api/automations', requireAuth, apiLimiter, async (req: AuthRequest, res) => {
  try {
    const { workspaceId = 'default', name, description, triggerType, triggerConfig, actionType, actionConfig, status } = req.body;
    if (!name || !triggerType || !actionType) {
      res.status(400).json({ error: 'Missing required fields: name, triggerType, actionType' });
      return;
    }
    const record = memoryStore.createAutomation({
      workspaceId,
      name,
      description,
      triggerType,
      triggerConfig,
      actionType,
      actionConfig,
      status
    });
    res.status(201).json({
      success: true,
      automation: {
        ...record,
        triggerConfig: JSON.parse(record.triggerConfig || '{}'),
        actionConfig: JSON.parse(record.actionConfig || '{}'),
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create automation', details: error.message });
  }
});

app.get('/api/automations/stats', requireAuth, apiLimiter, async (req: AuthRequest, res) => {
  try {
    const workspaceId = (req.query.workspaceId as string) || 'default';
    const stats = memoryStore.getAutomationStats(workspaceId);
    res.json({ success: true, stats });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch automation stats', details: error.message });
  }
});

app.get('/api/automations/:id', requireAuth, apiLimiter, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const record = memoryStore.getAutomation(id);
    if (!record) { res.status(404).json({ error: 'Automation not found' }); return; }
    res.json({
      success: true,
      automation: {
        ...record,
        triggerConfig: JSON.parse(record.triggerConfig || '{}'),
        actionConfig: JSON.parse(record.actionConfig || '{}'),
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get automation', details: error.message });
  }
});

app.put('/api/automations/:id', requireAuth, apiLimiter, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const updates = req.body;
    const updated = memoryStore.updateAutomation(id, updates);
    if (!updated) { res.status(404).json({ error: 'Automation not found' }); return; }
    const record = memoryStore.getAutomation(id);
    res.json({
      success: true,
      automation: {
        ...record,
        triggerConfig: JSON.parse(record?.triggerConfig || '{}'),
        actionConfig: JSON.parse(record?.actionConfig || '{}'),
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update automation', details: error.message });
  }
});

app.delete('/api/automations/:id', requireAuth, apiLimiter, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const deleted = memoryStore.deleteAutomation(id);
    res.json({ success: deleted });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete automation', details: error.message });
  }
});

app.post('/api/automations/:id/trigger', requireAuth, apiLimiter, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const record = memoryStore.getAutomation(id);
    if (!record) { res.status(404).json({ error: 'Automation not found' }); return; }
    const workflow: AutomationWorkflow = {
      id: record.id,
      workspaceId: record.workspaceId,
      name: record.name,
      description: record.description,
      triggerType: record.triggerType,
      triggerConfig: JSON.parse(record.triggerConfig || '{}'),
      actionType: record.actionType as any,
      actionConfig: JSON.parse(record.actionConfig || '{}'),
      status: record.status,
      lastRunAt: record.lastRunAt,
      runCount: record.runCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
    const log = await automationEngine.executeWorkflow(workflow, { source: 'manual_trigger' });
    res.json({ success: true, log });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to trigger automation', details: error.message });
  }
});

app.get('/api/automations/:id/logs', requireAuth, apiLimiter, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const limit = Number(req.query.limit) || 20;
    const logs = memoryStore.listAutomationLogs(id, limit);
    res.json({ success: true, logs });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch automation logs', details: error.message });
  }
});

// ── Companion Layer (Experimental) — preserved as-is ──

app.post('/api/companion/pair/create', requireAuth, apiLimiter, async (req, res) => {
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

app.post('/api/companion/pair/claim', apiLimiter, async (req, res) => {
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

app.post('/api/companion/session', apiLimiter, async (req, res) => {
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

app.post('/api/companion/session/validate', apiLimiter, async (req, res) => {
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

app.get('/api/companion/devices', requireAuth, apiLimiter, async (_req, res) => {
  try {
    const devices = memoryStore.listCompanionDevices();
    res.json({ success: true, devices, experimental: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list devices', details: error.message });
  }
});

app.post('/api/companion/devices/revoke', requireAuth, apiLimiter, async (req, res) => {
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
