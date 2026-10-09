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

import './load-env'; // must stay first: other modules read process.env when imported
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AgentOrchestrator, type AgentPersona } from './orchestrator';
import { ingestKnowledgeGraph } from '@torvaix/graph';
import { validateAutomationInput, validateAgentInput, validateAgentUpdate } from './validation';
import { listAgentToolInfo } from './agent-tools';
import { createAgentRuns } from './agent-runs';
import { formatApprovalRequest } from './approval-message';
import { closeAllMcpClients } from '@torvaix/mcp';
import { checkBrowserRequest, parseList, DEFAULT_ALLOWED_ORIGINS } from './http-security';
import { isValidEmail, validateWorkspaceId, validateMessages, validateText, clampCount, LIMITS } from './validation';
import { MemoryStore, type AutomationRecord } from '@torvaix/memory';
import { LLMClient, MODELS, PROVIDERS, isProviderId, pickInstalledModel, resolveModel, type ProviderId } from '@torvaix/providers';
import { SettingsStore, API_KEY_ENV, keyHint, validateApiKey, validateModelId } from './settings';
import { WorkspaceKnowledgeSynthesizer } from '@torvaix/intelligence';
import { AutomationEngine, AutomationWorkflow, torvaixEvents } from '@torvaix/events';
import rateLimit from 'express-rate-limit';



// ── Environment & Config ──

// Placeholder values shipped in old example configs are public, so anyone could forge tokens with them.
const PLACEHOLDER_JWT_SECRETS = new Set([
  'change-me-in-production',
  'torvaix-local-dev-secret-change-in-production',
]);
const JWT_SECRET = (() => {
  const configured = process.env.JWT_SECRET?.trim();
  if (configured && !PLACEHOLDER_JWT_SECRETS.has(configured)) return configured;
  console.warn(configured
    ? '[Auth] JWT_SECRET is a published placeholder — ignoring it and using a random secret. Set your own value to keep logins across restarts.'
    : '[Auth] JWT_SECRET not set — using random secret. Sessions will not persist across restarts!');
  return crypto.randomBytes(64).toString('hex');
})();

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
// Browser origins allowed to call the agent directly, and extra Host names (e.g. a Docker
// service name) accepted besides loopback. See http-security.ts.
const allowedOrigins = parseList(process.env.AGENT_ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS);
const allowedHosts = parseList(process.env.AGENT_ALLOWED_HOSTS, []);
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
const wss = new WebSocketServer({
  server,
  // Same browser protection as the HTTP routes: WebSockets aren't covered by CORS.
  verifyClient: ({ req }: { req: http.IncomingMessage }) =>
    checkBrowserRequest({ origin: req.headers.origin, host: req.headers.host }, { allowedOrigins, allowedHosts }).ok,
});

const memoryDbPath = path.join(DATA_DIR, 'torvaix.db');
const memoryStore = new MemoryStore(memoryDbPath);
const llmClient = new LLMClient();

// ── Settings changed from the app: API keys and the chat model ──

const settings = new SettingsStore(path.join(DATA_DIR, 'settings.json'));
type CloudProvider = keyof typeof API_KEY_ENV;
const CLOUD_PROVIDERS = Object.keys(API_KEY_ENV) as CloudProvider[];
const envApiKey = (provider: CloudProvider) => process.env[API_KEY_ENV[provider]]?.trim() || undefined;

// A key saved in the app wins over one in .env; removing it falls back to .env.
for (const provider of CLOUD_PROVIDERS) {
  const saved = settings.getApiKey(provider);
  if (saved) llmClient.setApiKey(provider, saved);
}

/** Installed Ollama model picked automatically; refreshed by probeOllama(). */
let autoModel = llmClient.getDefaultModel();

/**
 * The chat model in use. A model chosen in Settings wins, then TORVAIX_MODEL, then whichever
 * suitable model Ollama has installed.
 */
function currentModel(): { id: string; provider: ProviderId; source: 'saved' | 'env' | 'auto' } {
  const saved = settings.getModel();
  if (saved) return { ...saved, source: 'saved' };
  const fromEnv = process.env.TORVAIX_MODEL?.trim();
  if (fromEnv) return { id: fromEnv, provider: resolveModel(fromEnv).provider, source: 'env' };
  return { id: autoModel, provider: 'ollama', source: 'auto' };
}

function newOrchestrator(persona?: AgentPersona): AgentOrchestrator {
  const model = currentModel();
  return new AgentOrchestrator(memoryStore, { llm: llmClient, model: model.id, provider: model.provider, persona });
}

// ── Custom agents ──

const agentRuns = createAgentRuns({ store: memoryStore, newOrchestrator, events: torvaixEvents });

// ── Background Automation Engine ──

/** Settings column of an automation row as an object; `{}` if it isn't one. */
function parseConfig(json: string): Record<string, any> {
  try {
    const value = JSON.parse(json || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

/** A stored automation with its trigger and action settings parsed. */
function toWorkflow(r: AutomationRecord): AutomationWorkflow {
  return {
    ...r,
    actionType: r.actionType as AutomationWorkflow['actionType'],
    triggerConfig: parseConfig(r.triggerConfig),
    actionConfig: parseConfig(r.actionConfig),
  };
}

const automationEngine = new AutomationEngine({
  listAutomations: (workspaceId?: string) => memoryStore.listAutomations(workspaceId).map(toWorkflow),
  getAutomation: (id: string) => {
    const r = memoryStore.getAutomation(id);
    return r ? toWorkflow(r) : null;
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

  // Reports only: consolidation analyses memories without changing them or the graph.
  if (actionType === 'consolidate_memory') {
    const memories = (await memoryStore.getAllMemories(workspaceId)) as any[];
    const synthesizer = new WorkspaceKnowledgeSynthesizer();
    const report = synthesizer.consolidateWorkspace(workspaceId, memories);
    return {
      success: true,
      output: `Memory consolidation: ${report.processedCount} memories analysed, ${report.clustersCount} themes found, ${report.deduplicatedCount} likely duplicates.`
    };
  }

  if (actionType === 'synthesize_graph') {
    const memories = (await memoryStore.getAllMemories(workspaceId)) as any[];
    const synthesizer = new WorkspaceKnowledgeSynthesizer();
    const report = synthesizer.consolidateWorkspace(workspaceId, memories);
    // Write the links between each theme's keywords into this workspace's graph. They used to be
    // computed, reported as "generated" and then discarded.
    if (report.graphReinforcements.length > 0) {
      ingestKnowledgeGraph(
        {
          relationships: report.graphReinforcements.map(e => ({
            source: e.sourceEntity,
            relation: e.relation,
            target: e.targetEntity,
            confidence: e.weight,
          })),
        },
        workspaceId,
        { reinforce: false } // recomputed each run: re-running must not inflate existing links
      );
    }
    return {
      success: true,
      output: `Knowledge graph indexer: ${report.graphReinforcements.length} links written to the graph from ${report.clustersCount} themes.`
    };
  }

  // Reports memory health; it doesn't delete anything.
  if (actionType === 'clean_stale_memories') {
    const stats = memoryStore.getMemoryStats(workspaceId);
    return {
      success: true,
      output: `Memory health: ${stats.total} memories, average retrieval count ${stats.avgRetrieval}. Nothing was deleted.`
    };
  }

  if (actionType === 'agent_task') {
    const prompt = typeof actionConfig?.prompt === 'string' && actionConfig.prompt.trim()
      ? actionConfig.prompt
      : `Execute background automation: ${workflow.name}`;

    // An automation can run as one of the user's agents: its instructions and only its tools.
    const agentId = actionConfig?.agentId;
    if (agentId) {
      const custom = agentRuns.resolveAgentForWorkspace(agentId, workspaceId);
      if (!custom) {
        return {
          success: false,
          output: 'The agent for this automation no longer exists. Edit the automation and choose another agent.',
        };
      }
      const run = await agentRuns.startRun(custom, prompt, { announce: false });
      return { success: run.status !== 'error', output: run.output };
    }

    // Same model as chat, so background tasks use the auto-selected installed model too.
    const agent = newOrchestrator();
    const finalState = await agent.run({
      workspaceId,
      instructions: prompt,
    });
    // A run that could not reach the model, or whose tool failed, is a failed run: the log and
    // the success rate on the Automations page must not count it as done.
    return {
      success: !finalState.error,
      output: finalState.output || `Agent task finished with status completed`
    };
  }

  // Unknown action types are rejected when automations are saved; never report success for work not done.
  return {
    success: false,
    output: `Unsupported action type "${actionType}"; nothing was run.`
  };
});

// Start background automation loop
automationEngine.start(30_000);



// Browser protection. `Access-Control-Allow-Origin: *` plus tokenless auth let any website the
// user visited drive this server from their browser: queue a task, approve it, and run shell
// commands. The web app only calls us server-side, so reject foreign Origins and non-loopback
// Hosts (DNS rebinding), and grant CORS solely to the configured web app origins.
app.use((req, res, next) => {
  const verdict = checkBrowserRequest(
    { origin: req.headers.origin, host: req.headers.host },
    { allowedOrigins, allowedHosts }
  );
  if (!verdict.ok) {
    res.status(403).json({ error: verdict.reason });
    return;
  }
  if (req.headers.origin) {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Parse bodies only after the origin/host guard, so rejected requests never get buffered.
// 5 MB comfortably covers chat history plus a pasted file; the old 50 MB let one request buffer
// (and then store, embed and prompt with) a huge payload.
app.use(express.json({ limit: '5mb' }));

// A malformed body is the client's mistake: answer 400, not an HTML error page or a 500.
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err?.type === 'entity.too.large') { res.status(413).json({ error: 'Request body is too large' }); return; }
  if (err?.type === 'entity.parse.failed') { res.status(400).json({ error: 'Request body is not valid JSON' }); return; }
  next(err);
});

// A request with no JSON body leaves `req.body` undefined, and every route that read a field
// from it then answered 500 with the TypeError's text. An empty object lets each route's own
// validation answer 400 with the field that is missing.
app.use('/api/', (req, _res, next) => {
  if (req.body === undefined || req.body === null) req.body = {};
  next();
});

// `workspaceId` reaches SQL lookups and the filesystem. Reject anything but one plain string up
// front: an array or object used to surface as a 500 that leaked SQLite's error text.
app.use('/api/', (req, res, next) => {
  const invalid = validateWorkspaceId(req.query.workspaceId) ?? validateWorkspaceId(req.body?.workspaceId);
  if (invalid) { res.status(400).json({ error: invalid }); return; }
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
  // Every web request reaches us from the Next proxy's single IP, so all tabs share one bucket.
  // The UI's read-only polling (status, stats, pending approvals, logs) exhausted 60/min and
  // surfaced as "agent offline". Reads are cheap; limit writes, and agent runs separately.
  skip: (req) => req.method === 'GET' || req.method === 'HEAD',
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
  const [qdrantOk, ollamaOk] = await Promise.all([memoryStore.initQdrant(), probeOllama()]);
  const model = currentModel();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: { sqlite: true, qdrant: qdrantOk, ollama: ollamaOk },
    model: { id: model.id, provider: model.provider, source: model.source },
    embeddings: memoryStore.getEmbedSource(),
    ollamaUrl: llmClient.getOllamaUrl(),
    // Only readiness booleans; keys never leave the server.
    providers: PROVIDERS.map(p => ({ id: p.id, name: p.name, ready: llmClient.isProviderReady(p.id) })),
    version: '0.1.0',
  });
});

/** Check Ollama is up and refresh the auto-selected chat model from its installed tags. */
async function probeOllama(): Promise<boolean> {
  try {
    const r = await fetch(`${llmClient.getOllamaUrl()}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return false;
    if (!process.env.TORVAIX_MODEL) {
      const { models = [] } = (await r.json()) as { models?: { name: string }[] };
      const picked = pickInstalledModel(llmClient.getDefaultModel(), models.map(m => m.name));
      if (picked !== autoModel) {
        console.log(`[Model] Using installed Ollama model "${picked}" (choose another in Settings, or set TORVAIX_MODEL)`);
        autoModel = picked;
      }
    }
    return true;
  } catch {
    return false;
  }
}
void probeOllama();

// Local models as reported by Ollama: everything pulled (/api/tags) and what's in memory (/api/ps).
app.get('/api/system/models', requireAuth, async (_req, res) => {
  const base = llmClient.getOllamaUrl();
  try {
    const [tagsRes, psRes] = await Promise.all([
      fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) }),
      fetch(`${base}/api/ps`, { signal: AbortSignal.timeout(3000) }),
    ]);
    if (!tagsRes.ok) throw new Error(`Ollama responded ${tagsRes.status}`);
    const tags = (await tagsRes.json()) as { models?: any[] };
    const ps = psRes.ok ? ((await psRes.json()) as { models?: any[] }) : { models: [] };
    const loaded = new Map((ps.models ?? []).map(m => [m.name, m]));
    const models = (tags.models ?? []).map(m => {
      const running = loaded.get(m.name);
      return {
        name: m.name,
        size: m.size ?? 0,
        modifiedAt: m.modified_at ?? null,
        family: m.details?.family ?? null,
        parameterSize: m.details?.parameter_size ?? null,
        quantization: m.details?.quantization_level ?? null,
        loaded: !!running,
        sizeVram: running?.size_vram ?? 0,
        expiresAt: running?.expires_at ?? null,
      };
    });
    res.json({ success: true, reachable: true, ollamaUrl: base, models });
  } catch (error: any) {
    res.json({ success: false, reachable: false, ollamaUrl: base, models: [], error: error.message });
  }
});

// ── Settings: API keys and chat model ──

function providerStatus() {
  return PROVIDERS.filter(p => p.id !== 'ollama').map(p => {
    const id = p.id as CloudProvider;
    const saved = settings.getApiKey(id);
    const key = saved ?? envApiKey(id);
    return {
      id,
      name: p.name,
      ready: !!key,
      // Where the key in use comes from. The key itself never leaves the server.
      source: saved ? 'saved' : key ? 'env' : null,
      hint: key ? keyHint(key) : null,
      envVar: API_KEY_ENV[id],
    };
  });
}

function settingsPayload() {
  return {
    success: true,
    model: currentModel(),
    providers: providerStatus(),
    suggestedModels: MODELS.filter(m => !/embed/i.test(m.id)).map(m => ({ id: m.id, name: m.name, provider: m.provider, description: m.description })),
  };
}

app.get('/api/settings', requireAuth, (_req, res) => {
  res.json(settingsPayload());
});

app.put('/api/settings/providers/:id', requireAuth, (req, res) => {
  const id = req.params.id as string;
  if (!isProviderId(id) || id === 'ollama') { res.status(404).json({ error: 'Unknown provider' }); return; }
  const invalid = validateApiKey(req.body?.apiKey);
  if (invalid) { res.status(400).json({ error: invalid }); return; }
  try {
    settings.setApiKey(id, req.body.apiKey);
    llmClient.setApiKey(id, req.body.apiKey);
    res.json(settingsPayload());
  } catch (error: any) {
    res.status(500).json({ error: 'Could not save the API key', details: error.message });
  }
});

app.delete('/api/settings/providers/:id', requireAuth, (req, res) => {
  const id = req.params.id as string;
  if (!isProviderId(id) || id === 'ollama') { res.status(404).json({ error: 'Unknown provider' }); return; }
  try {
    settings.removeApiKey(id);
    llmClient.setApiKey(id, envApiKey(id)); // back to the key from .env, if there is one
    // A chat model that now has no key would fail on the next message; go back to automatic.
    if (settings.getModel()?.provider === id && !llmClient.isProviderReady(id)) settings.setModel(undefined);
    res.json(settingsPayload());
  } catch (error: any) {
    res.status(500).json({ error: 'Could not remove the API key', details: error.message });
  }
});

/** Checks a `{ provider, model }` pair from the client. Returns the choice or an error message. */
function parseModelChoice(body: any): { provider: ProviderId; id: string } | string {
  const { provider, model } = body ?? {};
  if (!isProviderId(provider)) return 'provider must be one of: ' + PROVIDERS.map(p => p.id).join(', ');
  const invalid = validateModelId(model);
  if (invalid) return invalid;
  if (!llmClient.isProviderReady(provider)) return `Add an API key for ${provider} first`;
  return { provider, id: (model as string).trim() };
}

// `{ auto: true }` goes back to automatic selection; otherwise `{ provider, model }`.
app.put('/api/settings/model', requireAuth, (req, res) => {
  try {
    if (req.body?.auto === true) {
      settings.setModel(undefined);
    } else {
      const choice = parseModelChoice(req.body);
      if (typeof choice === 'string') { res.status(400).json({ error: choice }); return; }
      settings.setModel(choice);
    }
    res.json(settingsPayload());
  } catch (error: any) {
    res.status(500).json({ error: 'Could not save the model', details: error.message });
  }
});

// Sends one tiny request, so a wrong key or model id shows up here and not in the middle of a chat.
app.post('/api/settings/test', requireAuth, agentLimiter, async (req, res) => {
  const choice = req.body?.provider === undefined ? currentModel() : parseModelChoice(req.body);
  if (typeof choice === 'string') { res.status(400).json({ error: choice }); return; }
  const started = Date.now();
  try {
    await llmClient.complete(choice.id, [{ role: 'user', content: 'Reply with the single word: ok' }], {
      provider: choice.provider,
      maxTokens: 16,
      temperature: 0,
      signal: AbortSignal.timeout(30_000),
    });
    res.json({ success: true, ok: true, model: choice.id, provider: choice.provider, ms: Date.now() - started });
  } catch (error: any) {
    res.json({ success: true, ok: false, model: choice.id, provider: choice.provider, error: String(error?.message ?? error).slice(0, 500) });
  }
});

// ── Auth Routes ──

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string' || !username.trim()) {
      res.status(400).json({ error: 'Missing required fields: username, email, password' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }
    if (!isValidEmail(email)) {
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
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
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

app.post('/api/workspaces', requireAuth, (req: AuthRequest, res) => {
  try {
    const { id, name = 'New Workspace', settings: rawSettings } = req.body ?? {};
    const invalid =
      validateText(name, 'name', LIMITS.nameChars) ??
      (id !== undefined ? validateWorkspaceId(id)?.replace('workspaceId', 'id') ?? null : null);
    if (invalid) { res.status(400).json({ error: invalid }); return; }
    // Agent tools run inside settings.path, so clients can't choose it; the server provisions it.
    const settings: Record<string, unknown> = rawSettings && typeof rawSettings === 'object' ? { ...rawSettings } : {};
    delete settings.path;
    
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

app.post('/api/conversations', requireAuth, (req: AuthRequest, res) => {
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
    const { instructions, workspaceId, messages = [], pendingActionId, agentId } = req.body;
    const isStream = req.query.stream === 'true';

    if ((typeof instructions !== 'string' || !instructions.trim()) && typeof pendingActionId !== 'string') {
      res.status(400).json({ error: 'instructions are required' });
      return;
    }
    const invalid =
      (typeof instructions === 'string' && instructions.length > LIMITS.instructionsChars ? 'instructions are too long' : null) ??
      validateMessages(req.body.messages);
    if (invalid) { res.status(400).json({ error: invalid }); return; }

    const runWorkspaceId = typeof workspaceId === 'string' && workspaceId ? workspaceId : 'default';
    // Answered by one of the user's agents when the chat names one. Checked before the stream
    // starts, so a wrong id is an ordinary JSON error.
    let persona: AgentPersona | undefined;
    if (agentId !== undefined && agentId !== null) {
      const chosen = agentRuns.resolveAgentForWorkspace(agentId, runWorkspaceId);
      if (!chosen) { res.status(400).json({ error: 'Unknown agent' }); return; }
      persona = agentRuns.personaOf(chosen);
    }

    if (isStream) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
    }

    const orchestrator = newOrchestrator(persona);

    // Resuming an approved action is handled inside the orchestrator, which verifies the
    // approval and claims it once. Never grant tool approval here from a bare id.

    // Stop the run when the client goes away (the chat's Stop button, a closed tab). Without
    // this the agent kept calling the model and running tools such as write_file afterwards.
    const cancel = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) cancel.abort();
    });
    const write = (chunk: string) => {
      if (!res.destroyed && !res.writableEnded) res.write(chunk);
    };

    const runId = crypto.randomUUID();
    const task = typeof instructions === 'string' && instructions.trim() ? instructions : 'Resume an approved action';
    torvaixEvents.emitAgentStarted({ agentId: runId, workspaceId: runWorkspaceId, task });

    const finalState = await orchestrator.run(
      {
        workspaceId: runWorkspaceId,
        instructions,
        messages,
        pendingActionId,
      },
      isStream ? write : undefined,
      { signal: cancel.signal }
    );

    if (cancel.signal.aborted) {
      if (!res.destroyed) res.end();
      return;
    }
    torvaixEvents.emitAgentFinished({
      agentId: runId,
      workspaceId: runWorkspaceId,
      task,
      status: finalState.pendingActionId ? 'awaiting_approval' : finalState.error ? 'error' : 'completed',
      result: finalState.output,
    });

    if (isStream) {
      let outputText = typeof finalState.output === 'string' ? finalState.output : String(finalState.output ?? '');
      if (finalState.pendingActionId) {
        const pending = memoryStore.getPendingAction(finalState.pendingActionId);
        outputText = formatApprovalRequest(finalState.pendingActionId, pending?.action);
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
      // Error part of the AI SDK data stream protocol, so the chat UI surfaces it instead of failing to parse.
      res.end(`3:${JSON.stringify(`Agent loop failed: ${error.message}`)}\n`);
    }
  }
});

// Approve Pending Action
app.post('/api/agent/approve', requireAuth, (req: AuthRequest, res) => {
  try {
    const { pendingActionId, status } = req.body ?? {};
    if (typeof pendingActionId !== 'string' || (status !== 'approved' && status !== 'rejected')) {
      res.status(400).json({ error: 'pendingActionId and a status of "approved" or "rejected" are required' });
      return;
    }
    const existing = memoryStore.getPendingAction(pendingActionId);
    if (!existing) {
      res.status(404).json({ error: 'Pending action not found' });
      return;
    }
    if (!memoryStore.updatePendingActionStatus(pendingActionId, status)) {
      res.status(409).json({ error: `Action was already ${existing.status}` });
      return;
    }
    // A denial ends the agent run that was waiting on this command, wherever it was denied.
    // The closed run goes back with the answer, so the Agents page can show it straight away.
    const closedRun = agentRuns.settleDecision(pendingActionId, status);
    res.json({ success: true, status, ...(closedRun ? { run: closedRun } : {}) });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update pending action' });
  }
});

// List Execution Logs
app.get('/api/agent/executions', requireAuth, (req: AuthRequest, res) => {
  try {
    const workspaceId = (req.query.workspaceId as string) || 'default';
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 500);
    const logs = memoryStore.listExecutionLogs(workspaceId, limit);
    res.json({ success: true, logs });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch execution logs', details: error.message });
  }
});

// List Pending Actions
app.get('/api/agent/pending-actions', requireAuth, (req: AuthRequest, res) => {
  try {
    const workspaceId = (req.query.workspaceId as string) || 'default';
    const requested = String(req.query.status ?? 'pending');
    const status = (['pending', 'approved', 'rejected', 'executed'].includes(requested) ? requested : 'pending') as any;
    const actions = memoryStore.listPendingActions(workspaceId, status);
    res.json({ success: true, actions });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch pending actions', details: error.message });
  }
});

// Dispatch Agent Task Directly
app.post('/api/agent/tasks', requireAuth, agentLimiter, async (req: AuthRequest, res) => {

  try {
    const { instructions, workspaceId = 'default', priority = 'medium', pendingActionId } = req.body;
    // pendingActionId resumes a task whose dangerous action the user just approved.
    if ((!instructions || typeof instructions !== 'string') && typeof pendingActionId !== 'string') {
      res.status(400).json({ error: 'Instructions are required' });
      return;
    }
    if (typeof instructions === 'string' && instructions.length > LIMITS.instructionsChars) {
      res.status(400).json({ error: 'Instructions are too long' });
      return;
    }

    // An approval for a command one of the user's agents is waiting on carries on that agent's
    // run, so approving here does not leave the run stuck.
    if (typeof pendingActionId === 'string' && agentRuns.hasWaitingRun(pendingActionId)) {
      const resumed = await agentRuns.resumeRun(pendingActionId, { announce: true });
      if ('error' in resumed) { res.status(resumed.status).json({ error: resumed.error }); return; }
      res.json({ success: true, task: agentRuns.taskOfRun(resumed.run, priority) });
      return;
    }

    const orchestrator = newOrchestrator();

    const taskId = crypto.randomUUID();
    const taskText = typeof instructions === 'string' && instructions.trim() ? instructions : 'Resume an approved action';
    // A resumed task was already announced when it was first dispatched.
    if (typeof pendingActionId !== 'string') {
      torvaixEvents.emitTaskCreated({ id: taskId, workspaceId, instructions: taskText });
    }
    torvaixEvents.emitAgentStarted({ agentId: taskId, workspaceId, task: taskText });

    const finalState = await orchestrator.run({
      workspaceId,
      instructions: typeof instructions === 'string' ? instructions : '',
      messages: [],
      pendingActionId,
    });

    const awaitingApproval = Boolean(finalState.pendingActionId);
    torvaixEvents.emitAgentFinished({
      agentId: taskId,
      workspaceId,
      task: taskText,
      status: awaitingApproval ? 'awaiting_approval' : finalState.error ? 'error' : 'completed',
      result: finalState.output,
    });
    // Not complete while it waits for approval; it completes when the approved action runs.
    // A task that failed isn't complete either, so "when a task completes" automations don't fire.
    if (!awaitingApproval && !finalState.error) {
      torvaixEvents.emitTaskCompleted({ id: taskId, workspaceId, instructions: taskText, output: finalState.output });
    }

    res.json({
      success: true,
      task: {
        id: taskId,
        workspaceId,
        instructions,
        priority,
        status: finalState.pendingActionId ? 'pending_confirmation' : finalState.error ? 'error' : 'completed',
        output: finalState.output,
        pendingActionId: finalState.pendingActionId,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to execute agent task', details: error.message });
  }
});

// Direct memory endpoints
app.get('/api/memory/list', requireAuth, async (req: AuthRequest, res) => {
  try {
    const workspaceId = (req.query.workspaceId as string) || 'default';
    const memories = await memoryStore.getAllMemories(workspaceId);
    res.json({ success: true, memories });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list memories', details: error.message });
  }
});

app.post('/api/memory/store', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { workspaceId = 'default', content, source } = req.body;
    const invalid = validateText(content, 'content', LIMITS.memoryChars);
    if (invalid) { res.status(400).json({ error: invalid }); return; }
    const id = await memoryStore.storeMemory(workspaceId, content, typeof source === 'string' && source ? source.slice(0, 100) : 'API');
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to store memory', details: error.message });
  }
});

app.post('/api/memory/query', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { workspaceId, query, topK, record } = req.body;
    const invalid = validateText(query, 'query', LIMITS.instructionsChars);
    if (invalid) { res.status(400).json({ error: invalid }); return; }
    const results = await memoryStore.queryMemory(workspaceId ?? 'default', query, clampCount(topK, 5, LIMITS.topK), { record: record !== false });
    res.json({ success: true, results });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to query memory', details: error.message });
  }
});

app.put('/api/memory/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const { content } = req.body ?? {};
    const invalid = validateText(content, 'content', LIMITS.memoryChars);
    if (invalid) { res.status(400).json({ error: invalid }); return; }
    if (!(await memoryStore.getMemoryById(id))) {
      res.status(404).json({ error: 'Memory not found' });
      return;
    }
    await memoryStore.updateMemory(id, content);
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update memory', details: error.message });
  }
});

app.delete('/api/memory/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    await memoryStore.deleteMemory(id);
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete memory', details: error.message });
  }
});

// Autonomous Memory Consolidation & Workspace Knowledge Synthesis
app.post('/api/memory/consolidate', requireAuth, async (req: AuthRequest, res) => {
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

app.get('/api/memory/insights', requireAuth, async (req: AuthRequest, res) => {
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

app.get('/api/automations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const workspaceId = (req.query.workspaceId as string) || 'default';
    memoryStore.seedDefaultAutomations(workspaceId);
    const automations = memoryStore.listAutomations(workspaceId).map(toWorkflow);
    res.json({ success: true, automations });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list automations', details: error.message });
  }
});

app.post('/api/automations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { workspaceId = 'default', name, description, triggerType, triggerConfig, actionType, actionConfig, status } = req.body;
    if (!name || !triggerType || !actionType) {
      res.status(400).json({ error: 'Missing required fields: name, triggerType, actionType' });
      return;
    }
    const invalid =
      validateText(name, 'name', LIMITS.nameChars) ??
      (description !== undefined && (typeof description !== 'string' || description.length > LIMITS.descriptionChars)
        ? `description must be text of at most ${LIMITS.descriptionChars} characters`
        : null) ??
      validateAutomationInput({ triggerType, triggerConfig, actionType, actionConfig, status });
    if (invalid) {
      res.status(400).json({ error: invalid });
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
    res.status(201).json({ success: true, automation: toWorkflow(record) });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create automation', details: error.message });
  }
});

app.get('/api/automations/stats', requireAuth, async (req: AuthRequest, res) => {
  try {
    const workspaceId = (req.query.workspaceId as string) || 'default';
    const stats = memoryStore.getAutomationStats(workspaceId);
    res.json({ success: true, stats });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch automation stats', details: error.message });
  }
});

app.get('/api/automations/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const record = memoryStore.getAutomation(id);
    if (!record) { res.status(404).json({ error: 'Automation not found' }); return; }
    res.json({ success: true, automation: toWorkflow(record) });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get automation', details: error.message });
  }
});

app.put('/api/automations/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const updates = req.body ?? {};
    const existing = memoryStore.getAutomation(id);
    if (!existing) { res.status(404).json({ error: 'Automation not found' }); return; }
    // Validate the result of the update, so e.g. switching to an event trigger needs a valid event.
    const invalid =
      (updates.name !== undefined ? validateText(updates.name, 'name', LIMITS.nameChars) : null) ??
      (updates.description !== undefined && (typeof updates.description !== 'string' || updates.description.length > LIMITS.descriptionChars)
        ? `description must be text of at most ${LIMITS.descriptionChars} characters`
        : null) ??
      validateAutomationInput({
        triggerType: updates.triggerType ?? existing.triggerType,
        triggerConfig: updates.triggerConfig ?? parseConfig(existing.triggerConfig),
        actionType: updates.actionType ?? existing.actionType,
        actionConfig: updates.actionConfig ?? parseConfig(existing.actionConfig),
        status: updates.status ?? existing.status,
      });
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }
    // Only what the user can edit. Run statistics (lastRunAt, runCount) belong to the engine.
    const { name, description, triggerType, triggerConfig, actionType, actionConfig, status } = updates;
    memoryStore.updateAutomation(id, { name, description, triggerType, triggerConfig, actionType, actionConfig, status });
    const record = memoryStore.getAutomation(id);
    if (!record) { res.status(404).json({ error: 'Automation not found' }); return; }
    res.json({ success: true, automation: toWorkflow(record) });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update automation', details: error.message });
  }
});

app.delete('/api/automations/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const deleted = memoryStore.deleteAutomation(id);
    res.json({ success: deleted });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete automation', details: error.message });
  }
});

app.post('/api/automations/:id/trigger', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const record = memoryStore.getAutomation(id);
    if (!record) { res.status(404).json({ error: 'Automation not found' }); return; }
    const workflow = toWorkflow(record);
    const log = await automationEngine.executeWorkflow(workflow, { source: 'manual_trigger' });
    res.json({ success: true, log });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to trigger automation', details: error.message });
  }
});

app.get('/api/automations/:id/logs', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const limit = clampCount(req.query.limit, 20, 200);
    const logs = memoryStore.listAutomationLogs(id, limit);
    res.json({ success: true, logs });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch automation logs', details: error.message });
  }
});

// ── Custom Agents API ──

app.get('/api/agents', requireAuth, async (req: AuthRequest, res) => {
  try {
    const workspaceId = (req.query.workspaceId as string) || 'default';
    memoryStore.seedDefaultAgents(workspaceId);
    res.json({ success: true, agents: memoryStore.listAgents(workspaceId), availableTools: listAgentToolInfo() });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list agents', details: error.message });
  }
});

app.post('/api/agents', requireAuth, async (req: AuthRequest, res) => {
  try {
    const checked = validateAgentInput(req.body);
    if (checked.error !== undefined) { res.status(400).json({ error: checked.error }); return; }
    const workspaceId = typeof req.body.workspaceId === 'string' && req.body.workspaceId ? req.body.workspaceId : 'default';
    const created = agentRuns.createAgentWithinLimit(workspaceId, checked.value);
    if ('error' in created) { res.status(400).json({ error: created.error }); return; }
    res.status(201).json({ success: true, agent: created.agent });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create agent', details: error.message });
  }
});

app.put('/api/agents/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    if (!memoryStore.getAgent(id)) { res.status(404).json({ error: 'Agent not found' }); return; }
    const checked = validateAgentUpdate(req.body);
    if (checked.error !== undefined) { res.status(400).json({ error: checked.error }); return; }
    const agent = memoryStore.updateAgent(id, checked.value);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    res.json({ success: true, agent });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update agent', details: error.message });
  }
});

app.delete('/api/agents/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const deleted = memoryStore.deleteAgent(req.params.id as string);
    res.json({ success: deleted });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete agent', details: error.message });
  }
});

// Runs an agent on a task. With a pendingActionId it carries on with the run that was waiting for
// that approval instead. The approval itself is given through /api/agent/approve.
app.post('/api/agents/:id/run', requireAuth, agentLimiter, async (req: AuthRequest, res) => {
  try {
    const agent = memoryStore.getAgent(req.params.id as string);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

    const { task, pendingActionId } = req.body ?? {};
    const resuming = pendingActionId !== undefined && pendingActionId !== null;
    if (resuming && (typeof pendingActionId !== 'string' || !pendingActionId || pendingActionId.length > LIMITS.workspaceIdChars)) {
      res.status(400).json({ error: 'pendingActionId must be a non-empty string' });
      return;
    }
    const invalid = resuming ? null : validateText(task, 'task', LIMITS.instructionsChars);
    if (invalid) { res.status(400).json({ error: invalid }); return; }

    // Stop when the client goes away, as /api/agent/run does.
    const cancel = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) cancel.abort();
    });

    // A resumed run keeps its own task and history; the request only says which approval it is for.
    const options = { signal: cancel.signal, announce: true };
    let run;
    if (resuming) {
      const resumed = await agentRuns.resumeRun(pendingActionId, { ...options, agentId: agent.id });
      if ('error' in resumed) { res.status(resumed.status).json({ error: resumed.error }); return; }
      run = resumed.run;
    } else {
      run = await agentRuns.startRun(agent, task as string, options);
    }
    if (cancel.signal.aborted) {
      if (!res.destroyed) res.end();
      return;
    }
    res.json({ success: true, run });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to run agent', details: error.message });
  }
});

app.get('/api/agents/:id/runs', requireAuth, async (req: AuthRequest, res) => {
  try {
    const runs = memoryStore.listAgentRuns(req.params.id as string, clampCount(req.query.limit, 20, 100));
    res.json({ success: true, runs });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch agent runs', details: error.message });
  }
});

// ── Companion Layer (Experimental) — preserved as-is ──

app.post('/api/companion/pair/create', requireAuth, async (req, res) => {
  try {
    const { scope = 'readonly', expiryMinutes: rawExpiry = 10 } = req.body ?? {};
    if (scope !== 'readonly' && scope !== 'admin') {
      res.status(400).json({ error: 'scope must be "readonly" or "admin"' });
      return;
    }
    const expiryMinutes = Math.min(Math.max(Number(rawExpiry) || 10, 1), 60);
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
    // Refreshing requires the device's current session token. A bare deviceId (visible in the
    // device list) used to be enough to mint a new session and lock the real device out.
    const { deviceId, sessionToken: currentToken } = req.body ?? {};
    if (typeof deviceId !== 'string' || typeof currentToken !== 'string') {
      res.status(400).json({ error: 'Missing deviceId or sessionToken' });
      return;
    }
    const current = memoryStore.validateSession(currentToken);
    if (!current || current.deviceId !== deviceId) {
      res.status(401).json({ error: 'Invalid or expired session; pair the device again' });
      return;
    }
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

// Unknown API paths and unexpected errors answer in JSON like every other route, instead of
// Express's HTML error pages (which the web app can't show as a message).
app.use('/api/', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server] Unhandled error:', err);
  if (res.headersSent) { res.end(); return; }
  res.status(500).json({ error: 'Internal server error' });
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

const PORT = Number(process.env.AGENT_PORT) || 3001;
// Loopback only by default: the agent can run shell commands and skips auth when no token is
// sent, so it must not be reachable from other machines unless explicitly configured.
const HOST = process.env.AGENT_HOST || '127.0.0.1';
server.listen(PORT, HOST, () => {
  console.log(`Torvaix Agent Server running on http://${HOST}:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Auth:         http://localhost:${PORT}/api/auth/register | /api/auth/login`);
  console.log(`Agent API:    http://localhost:${PORT}/api/agent/run`);
  console.log(`Memory API:   http://localhost:${PORT}/api/memory/store`);
  console.log(`Companion:    http://localhost:${PORT}/api/companion/pair/create [EXPERIMENTAL]`);
});

// ── Graceful Shutdown ──
// Tool calls spawn MCP server child processes and SQLite holds file handles; without this,
// every restart (including tsx --watch reloads) leaked those processes and left the WAL open.
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Shutdown] ${signal} received — stopping Torvaix agent server...`);

  const failsafe = setTimeout(() => {
    console.warn('[Shutdown] Timed out, forcing exit.');
    process.exit(1);
  }, 8000);
  failsafe.unref();

  try {
    automationEngine.stop();
    await closeAllMcpClients();
    wss.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    memoryStore.close();
    console.log('[Shutdown] Clean exit.');
  } catch (error: any) {
    console.error('[Shutdown] Error while shutting down:', error?.message ?? error);
  } finally {
    clearTimeout(failsafe);
    process.exit(0);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

export default app;
