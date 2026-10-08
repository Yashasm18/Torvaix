/**
 * Torvaix Memory Store
 *
 * Dual-layer memory system:
 * - Source of truth: SQLite, with FTS5 keyword search
 * - Optional: Qdrant vector search, using Ollama embeddings (or OpenAI if a key is set)
 * - Qdrant and Ollama are re-checked periodically, so starting either later just works,
 *   and memories saved while Qdrant was down are indexed once it is reachable
 *
 * Also manages workspaces, conversations, pending actions, execution logs,
 * custom agents and their runs, and companion device pairing.
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { torvaixEvents } from '@torvaix/events';

export interface MemoryMetadata {
  id: string;
  workspaceId: string;
  source: string;
  content: string;
  createdAt: string;
}

export interface MemoryQueryResult {
  id: string;
  content: string;
  source: string;
  score: number;
  retrievalType?: 'vector' | 'keyword' | 'hybrid_rrf';
  /** When the memory was saved (SQLite UTC timestamp). */
  createdAt?: string;
}

export interface Workspace {
  id: string;
  name: string;
  settings: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: string;
}

export interface PendingAction {
  id: string;
  workspaceId: string;
  action: string;
  params: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  createdAt: string;
}

export interface ExecutionLog {
  id: string;
  workspaceId: string;
  action: string;
  params: string;
  result: string | null;
  status: string;
  createdAt: string;
}

export interface AutomationRecord {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  triggerType: 'schedule' | 'event' | 'manual';
  triggerConfig: string; // JSON
  actionType: string;
  actionConfig: string; // JSON
  status: 'active' | 'paused' | 'draft';
  lastRunAt: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationLogRecord {
  id: string;
  automationId: string;
  workspaceId: string;
  status: 'running' | 'success' | 'error';
  output: string;
  durationMs: number;
  startedAt: string;
  completedAt: string | null;
}
/** An agent the user set up: its own instructions and the tools it may use. */
export interface AgentRecord {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  instructions: string;
  /** Ids of the tools it may use. The agent server checks them against its tool catalogue. */
  tools: string[];
  createdAt: string;
  updatedAt: string;
  runCount: number;
  lastRunAt: string | null;
}

/** "cancelled" is a run the user stopped, or one whose command the user denied. */
export type AgentRunStatus = 'completed' | 'awaiting_approval' | 'error' | 'cancelled';

export interface AgentRunRecord {
  id: string;
  agentId: string;
  workspaceId: string;
  task: string;
  status: AgentRunStatus;
  output: string;
  /** Set while the run waits for the user to approve a shell or Python command. */
  pendingActionId: string | null;
  durationMs: number;
  createdAt: string;
}

/** A message of a run's history, as the agent loop keeps it. */
export interface AgentContextMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** A run together with the history it needs to continue after an approval. */
export interface AgentRunDetail extends AgentRunRecord {
  context: AgentContextMessage[];
}

/** Which embedding source is active. */
export type EmbedSource = 'ollama' | 'openai' | 'local' | 'none';

// Words too common to signal relevance on their own.
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'and', 'or', 'in', 'on', 'at',
  'for', 'with', 'my', 'me', 'i', 'you', 'your', 'it', 'its', 'this', 'that', 'these', 'those', 'what', 'which',
  'who', 'whom', 'how', 'why', 'when', 'where', 'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will',
  'about', 'tell', 'please', 'hi', 'hey', 'hello', 'we', 'our', 'us', 'as', 'by', 'from', 'so', 'if', 'then',
  'than', 'there', 'here', 'any', 'some', 'have', 'has', 'had', 'not', 'no', 'yes', 'just', 'like', 'know',
]);

/**
 * Lowercased, de-duplicated search keywords. Unicode-aware, so Kannada, Hindi, accented and
 * CJK text are searchable (the old /[^a-zA-Z0-9]/ filter erased them entirely).
 */
export function extractKeywords(query: string): string[] {
  const words = query
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w && !STOP_WORDS.has(w) && (Array.from(w).length > 1 || /[^\x00-\x7F]/.test(w)));
  return Array.from(new Set(words));
}

/**
 * Automation trigger/action settings are stored as a JSON object. Anything else (a bare string,
 * an array, broken JSON) becomes `{}`: one such row used to make every later read throw, which
 * broke the Automations page and stopped the scheduler for all workspaces.
 */
export function toConfigJson(value: unknown): string {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = null;
    }
  }
  return JSON.stringify(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
}

/** Most of a paused run's history that is kept, so a long run can't fill the database. */
const MAX_AGENT_CONTEXT_CHARS = 40_000;

/** The most recent messages that fit the budget. The newest message is always kept, shortened if it alone is too long. */
function capAgentContext(messages: AgentContextMessage[]): AgentContextMessage[] {
  const keep: AgentContextMessage[] = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const length = messages[i].content.length;
    if (total + length > MAX_AGENT_CONTEXT_CHARS && keep.length > 0) break;
    keep.unshift(messages[i]);
    total += length;
  }
  if (keep.length === 1 && keep[0].content.length > MAX_AGENT_CONTEXT_CHARS) {
    keep[0] = { ...keep[0], content: keep[0].content.slice(-MAX_AGENT_CONTEXT_CHARS) };
  }
  return keep;
}

/** A stored run history as messages; anything that isn't a list of valid messages becomes empty. */
function parseAgentContext(json: string): AgentContextMessage[] {
  try {
    const value = JSON.parse(json || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter(
      (m): m is AgentContextMessage =>
        !!m && typeof m === 'object' &&
        (m.role === 'system' || m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
    );
  } catch {
    return [];
  }
}

/** A stored tool list as an array of strings; anything else becomes empty. */
function parseAgentTools(json: string): string[] {
  try {
    const value = JSON.parse(json || '[]');
    return Array.isArray(value) ? value.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

const AGENT_RUN_COLUMNS = 'id, agentId, workspaceId, task, status, output, pendingActionId, durationMs, createdAt';

/** The agents every workspace starts with. */
const DEFAULT_AGENTS: { name: string; description: string; instructions: string; tools: string[] }[] = [
  {
    name: 'Researcher',
    description: 'Looks things up on the web and summarises what it finds, with sources.',
    instructions:
      'You are a careful researcher. Search the web for what the task asks, compare what you find, and write a short, clear summary. ' +
      'List the sources you used at the end. If you cannot find a reliable answer, say so instead of guessing.',
    tools: ['web_search'],
  },
  {
    name: 'File assistant',
    description: 'Reads and writes files in the workspace folder.',
    instructions:
      'You help with files in the workspace folder. Read a file before you change it, write only what the task asks for, ' +
      'and say which files you read or changed. Use the repository scan to get an overview of a project.',
    tools: ['read_file', 'write_file', 'repo_scan'],
  },
  {
    name: 'Shell helper',
    description: 'Runs shell commands and Python code. Every run waits for your approval.',
    instructions:
      'You get things done by running shell commands and short Python scripts in the workspace folder. ' +
      'Run one command at a time, say what it does, and report its output. The user approves every command before it runs.',
    tools: ['bash', 'python', 'read_file', 'write_file'],
  },
];

const AGENT_SELECT = `
  SELECT a.*,
    (SELECT COUNT(*) FROM agent_runs r WHERE r.agentId = a.id) AS runCount,
    (SELECT MAX(r.createdAt) FROM agent_runs r WHERE r.agentId = a.id) AS lastRunAt
  FROM agents a`;

/** How long a Qdrant/Ollama availability check is trusted before it is repeated. */
const SERVICE_RECHECK_MS = 30_000;

/** A vector from a real embedding model, tagged so vectors from different models are never compared. */
interface ModelEmbedding {
  vector: number[];
  model: string;
}

export class MemoryStore {
  private db: Database.Database;
  private qdrant: QdrantClient;
  private qdrantAvailable = false;
  private qdrantCheckedAt = 0;
  /** Vector size of the existing Qdrant collection; vectors of any other size are not sent to it. */
  private collectionVectorSize: number | null = null;
  private backfillRunning: Promise<number> | null = null;
  private loggedDimensionMismatch = false;
  private collectionName = 'torvaix_memories';
  private embedModel = 'nomic-embed-text';
  private ollamaUrl: string;
  private ollamaAvailable = false;
  private ollamaCheckedAt = 0;
  private embedSource: EmbedSource = 'none';
  private vectorSize = 768; // default for nomic-embed-text

  constructor(dbPath: string, options?: { ollamaUrl?: string; qdrantUrl?: string }) {
    this.db = new Database(dbPath);
    this.ollamaUrl = options?.ollamaUrl ?? process.env.OLLAMA_URL ?? 'http://localhost:11434';
    const qdrantUrl = options?.qdrantUrl ?? process.env.QDRANT_URL ?? 'http://localhost:6333';
    // Short timeout: an unreachable Qdrant must not stall chat requests while it is re-checked.
    this.qdrant = new QdrantClient({ url: qdrantUrl, timeout: 5_000, checkCompatibility: false });
    this.initSQLite();
  }

  // ── SQLite Schema ──

  private initSQLite() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        workspaceId TEXT NOT NULL,
        source TEXT NOT NULL,
        content TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        lastAccessedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        retrievalCount INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        settings TEXT NOT NULL DEFAULT '{}',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        workspaceId TEXT NOT NULL,
        title TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(workspaceId) REFERENCES workspaces(id)
      );

      CREATE TABLE IF NOT EXISTS pending_actions (
        id TEXT PRIMARY KEY,
        workspaceId TEXT NOT NULL,
        action TEXT NOT NULL,
        params TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(workspaceId) REFERENCES workspaces(id)
      );

      CREATE TABLE IF NOT EXISTS execution_logs (
        id TEXT PRIMARY KEY,
        workspaceId TEXT NOT NULL,
        action TEXT NOT NULL,
        params TEXT NOT NULL,
        result TEXT,
        status TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(workspaceId) REFERENCES workspaces(id)
      );

      -- Automation Workflows & Logs
      CREATE TABLE IF NOT EXISTS automations (
        id TEXT PRIMARY KEY,
        workspaceId TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        triggerType TEXT NOT NULL,
        triggerConfig TEXT NOT NULL DEFAULT '{}',
        actionType TEXT NOT NULL,
        actionConfig TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'active',
        lastRunAt DATETIME,
        runCount INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(workspaceId) REFERENCES workspaces(id)
      );

      CREATE TABLE IF NOT EXISTS automation_logs (
        id TEXT PRIMARY KEY,
        automationId TEXT NOT NULL,
        workspaceId TEXT NOT NULL,
        status TEXT NOT NULL,
        output TEXT NOT NULL DEFAULT '',
        durationMs INTEGER NOT NULL DEFAULT 0,
        startedAt DATETIME NOT NULL,
        completedAt DATETIME,
        FOREIGN KEY(automationId) REFERENCES automations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_automations_workspace ON automations(workspaceId);
      CREATE INDEX IF NOT EXISTS idx_automation_logs_auto ON automation_logs(automationId);

      -- Custom agents and their runs. "context" is the run's message history as JSON, so a run
      -- that paused for an approval can carry on with what it already did.
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        workspaceId TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        instructions TEXT NOT NULL,
        tools TEXT NOT NULL DEFAULT '[]',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY(workspaceId) REFERENCES workspaces(id)
      );

      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        agentId TEXT NOT NULL,
        workspaceId TEXT NOT NULL,
        task TEXT NOT NULL,
        status TEXT NOT NULL,
        output TEXT NOT NULL DEFAULT '',
        pendingActionId TEXT,
        context TEXT NOT NULL DEFAULT '[]',
        durationMs INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY(agentId) REFERENCES agents(id),
        FOREIGN KEY(workspaceId) REFERENCES workspaces(id)
      );

      CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspaceId);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agentId);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_pending ON agent_runs(pendingActionId);


      -- Users table (for auth hardening)
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        passwordHash TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        lastLogin DATETIME
      );

      CREATE INDEX IF NOT EXISTS idx_memories_workspace ON memories(workspaceId);
      CREATE INDEX IF NOT EXISTS idx_memories_accessed ON memories(lastAccessedAt);

      -- Companion Layer (Experimental): Pairing tokens
      CREATE TABLE IF NOT EXISTS companion_tokens (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        scope TEXT NOT NULL DEFAULT 'readonly',
        expiresAt DATETIME NOT NULL,
        claimedByDeviceId TEXT,
        revoked INTEGER NOT NULL DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Companion Layer (Experimental): Trusted devices
      CREATE TABLE IF NOT EXISTS companion_devices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        fingerprint TEXT NOT NULL UNIQUE,
        scope TEXT NOT NULL DEFAULT 'readonly',
        lastSeenAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        sessionToken TEXT,
        sessionExpiresAt DATETIME,
        revoked INTEGER NOT NULL DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Full-Text Search (FTS5) table and triggers for sparse BM25 retrieval
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        id UNINDEXED,
        workspaceId UNINDEXED,
        content
      );

      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(id, workspaceId, content) VALUES (new.id, new.workspaceId, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        DELETE FROM memories_fts WHERE id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        DELETE FROM memories_fts WHERE id = old.id;
        INSERT INTO memories_fts(id, workspaceId, content) VALUES (new.id, new.workspaceId, new.content);
      END;
    `);
    
    // FTS5 tables have no unique constraint, so re-sync only when the index has drifted.
    try {
      const memCount = (this.db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c;
      const ftsCount = (this.db.prepare('SELECT COUNT(*) as c FROM memories_fts').get() as { c: number }).c;
      const indexedCount = (this.db.prepare(
        'SELECT COUNT(DISTINCT id) as c FROM memories_fts WHERE id IN (SELECT id FROM memories)'
      ).get() as { c: number }).c;

      if (ftsCount !== memCount || indexedCount !== memCount) {
        this.db.transaction(() => {
          this.db.exec('DELETE FROM memories_fts');
          this.db.exec('INSERT INTO memories_fts(id, workspaceId, content) SELECT id, workspaceId, content FROM memories');
        })();
      }
    } catch { /* FTS5 unavailable — keyword search falls back to LIKE */ }
    
    // Attempt to alter table if the columns don't exist (for existing dev databases)
    try {
      this.db.exec(`ALTER TABLE memories ADD COLUMN lastAccessedAt DATETIME DEFAULT CURRENT_TIMESTAMP;`);
    } catch (e) { /* Column might already exist */ }
    try {
      this.db.exec(`ALTER TABLE memories ADD COLUMN retrievalCount INTEGER DEFAULT 0;`);
    } catch (e) { /* Column might already exist */ }

    // Ensure default workspace exists to avoid FOREIGN KEY constraints failing
    this.db.exec(`INSERT OR IGNORE INTO workspaces (id, name) VALUES ('default', 'Default Workspace');`);

    // Repair automation settings saved by versions that stored whatever the client sent.
    const fixConfig = this.db.prepare('UPDATE automations SET triggerConfig = ?, actionConfig = ? WHERE id = ?');
    const rows = this.db.prepare('SELECT id, triggerConfig, actionConfig FROM automations').all() as {
      id: string; triggerConfig: string; actionConfig: string;
    }[];
    for (const row of rows) {
      const triggerConfig = toConfigJson(row.triggerConfig);
      const actionConfig = toConfigJson(row.actionConfig);
      if (triggerConfig !== row.triggerConfig || actionConfig !== row.actionConfig) {
        fixConfig.run(triggerConfig, actionConfig, row.id);
      }
    }
  }

  // ── Qdrant ──

  /**
   * Whether Qdrant is reachable. The answer is cached for SERVICE_RECHECK_MS rather than
   * forever, so a Qdrant started (or restarted) after the agent is picked up automatically.
   */
  async initQdrant(): Promise<boolean> {
    if (Date.now() - this.qdrantCheckedAt < SERVICE_RECHECK_MS) return this.qdrantAvailable;
    const firstCheck = this.qdrantCheckedAt === 0;
    this.qdrantCheckedAt = Date.now();
    const wasAvailable = this.qdrantAvailable;

    try {
      const result = await this.qdrant.getCollections();
      const exists = result.collections.some(c => c.name === this.collectionName);

      if (exists) {
        const info = await this.qdrant.getCollection(this.collectionName);
        const vectors = info.config?.params?.vectors as { size?: number } | undefined;
        this.collectionVectorSize = typeof vectors?.size === 'number' ? vectors.size : null;
      } else {
        // Size the collection for the embedding model in use. Without one there is nothing to store yet.
        const probe = await this.embedWithModel('test');
        if (probe) {
          await this.qdrant.createCollection(this.collectionName, {
            vectors: { size: probe.vector.length, distance: 'Cosine' },
          });
          this.collectionVectorSize = probe.vector.length;
          console.log(`[MemoryStore] Created Qdrant collection: ${this.collectionName} (dim=${probe.vector.length})`);
        }
      }

      this.qdrantAvailable = true;
      if (!wasAvailable) {
        console.log('[MemoryStore] Qdrant connected successfully');
        // Index memories saved while Qdrant was unreachable (or embedded with another model).
        void this.backfillVectors().catch(e => console.warn('[MemoryStore] Vector backfill failed:', e));
      }
    } catch (e) {
      this.qdrantAvailable = false;
      if (wasAvailable || firstCheck) {
        console.warn('[MemoryStore] Qdrant unavailable — using SQLite keyword search only');
      }
    }

    return this.qdrantAvailable;
  }

  /**
   * Adds vectors for memories that are missing from Qdrant or were embedded with a different
   * model. Returns how many memories were (re)indexed.
   */
  backfillVectors(): Promise<number> {
    if (this.backfillRunning) return this.backfillRunning;
    this.backfillRunning = (async () => {
      let indexed = 0;
      const rows = this.db.prepare('SELECT id, workspaceId, source, content FROM memories ORDER BY createdAt').all() as {
        id: string; workspaceId: string; source: string; content: string;
      }[];

      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const existing = await this.qdrant.retrieve(this.collectionName, {
          ids: batch.map(r => r.id),
          with_payload: true,
          with_vector: false,
        });
        const current = new Map(existing.map(p => [String(p.id), (p.payload as { embedModel?: string } | null)?.embedModel]));

        for (const row of batch) {
          const embedding = await this.embedWithModel(row.content);
          if (!embedding) return indexed; // no embedding model available right now
          if (current.get(row.id) === embedding.model) continue;
          if (await this.upsertVector(row.id, embedding, { workspaceId: row.workspaceId, source: row.source })) indexed++;
        }
      }
      if (indexed > 0) console.log(`[MemoryStore] Indexed ${indexed} memories in Qdrant`);
      return indexed;
    })().finally(() => {
      this.backfillRunning = null;
    });
    return this.backfillRunning;
  }

  /** Writes one memory's vector to Qdrant. Returns false (without throwing) if it can't be stored. */
  private async upsertVector(id: string, embedding: ModelEmbedding, payload: { workspaceId: string; source: string }): Promise<boolean> {
    if (this.collectionVectorSize !== null && embedding.vector.length !== this.collectionVectorSize) {
      if (!this.loggedDimensionMismatch) {
        this.loggedDimensionMismatch = true;
        console.warn(
          `[MemoryStore] ${embedding.model} produces ${embedding.vector.length}-dim vectors but the Qdrant collection ` +
            `"${this.collectionName}" uses ${this.collectionVectorSize}. Vector search is off until they match; keyword search still works.`
        );
      }
      return false;
    }
    try {
      await this.qdrant.upsert(this.collectionName, {
        wait: true,
        points: [{ id, vector: embedding.vector, payload: { ...payload, embedModel: embedding.model } }],
      });
      return true;
    } catch (e) {
      console.warn('[MemoryStore] Qdrant upsert failed:', e);
      return false;
    }
  }

  // ── Embedding Chain: Ollama → OpenAI → Local ──

  private async checkOllama(): Promise<boolean> {
    if (Date.now() - this.ollamaCheckedAt < SERVICE_RECHECK_MS) return this.ollamaAvailable;
    this.ollamaCheckedAt = Date.now();
    const wasAvailable = this.ollamaAvailable;

    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3_000) });
      this.ollamaAvailable = response.ok;
    } catch (e) {
      this.ollamaAvailable = false;
    }
    if (this.ollamaAvailable !== wasAvailable) {
      console.log(`[MemoryStore] Ollama ${this.ollamaAvailable ? 'connected successfully' : 'unavailable'}`);
    }
    return this.ollamaAvailable;
  }

  /**
   * Embedding from a real model: Ollama first, then OpenAI if a key is set. Returns null when
   * neither is available. Only these vectors go to Qdrant; hash-based local vectors would make
   * similarity scores meaningless next to model vectors.
   */
  private async embedWithModel(text: string): Promise<ModelEmbedding | null> {
    if (await this.checkOllama()) {
      try {
        const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.embedModel, prompt: text }),
          signal: AbortSignal.timeout(30_000),
        });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.embedding) && data.embedding.length > 0) {
            this.embedSource = 'ollama';
            return { vector: data.embedding, model: `ollama:${this.embedModel}` };
          }
        }
      } catch (e) {
        console.warn('[MemoryStore] Ollama embedding failed:', e);
      }
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
          signal: AbortSignal.timeout(30_000),
        });
        if (response.ok) {
          const data = await response.json();
          const embedding = data.data?.[0]?.embedding;
          if (Array.isArray(embedding) && embedding.length > 0) {
            this.embedSource = 'openai';
            return { vector: embedding, model: 'openai:text-embedding-3-small' };
          }
        }
      } catch (e) {
        console.warn('[MemoryStore] OpenAI embedding fallback failed:', e);
      }
    }

    return null;
  }

  /** An embedding for `text`: a model embedding when available, otherwise a local keyword vector. */
  async generateEmbedding(text: string): Promise<number[] | null> {
    const embedding = await this.embedWithModel(text);
    if (embedding) return embedding.vector;
    this.embedSource = 'local';
    return this.localKeywordEmbedding(text);
  }

  /** Deterministic local embedding — no ML, no network, always available. */
  private localKeywordEmbedding(text: string): number[] {
    const dims = this.vectorSize;
    const vec = new Float32Array(dims);
    const safeText = typeof text === 'string' ? text.slice(0, 10000) : '';
    const rawWords = safeText.toLowerCase().split(/\W+/);
    const words = rawWords.filter(w => typeof w === 'string' && w.length > 2 && w.length <= 64).slice(0, 500);

    for (const word of words) {
      // Distribute word hashes across dimensions
      let hash = 0;
      const wordLen = Math.min(typeof word === 'string' ? word.length : 0, 64);
      for (let i = 0; i < wordLen; i++) {
        hash = ((hash << 5) - hash) + word.charCodeAt(i);
        hash |= 0;
      }
      const idx1 = Math.abs(hash) % dims;
      const idx2 = Math.abs(hash ^ 0x9e3779b9) % dims;
      vec[idx1] += 1.0;
      vec[idx2] += 0.5;
    }

    // Normalize to unit vector
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    if (mag > 0) {
      for (let i = 0; i < dims; i++) vec[i] /= mag;
    }

    return Array.from(vec);
  }

  /** Get the currently active embedding source. */
  getEmbedSource(): EmbedSource {
    return this.embedSource;
  }

  // ── Memory CRUD ──

  async storeMemory(workspaceId: string, content: string, source: string): Promise<string> {
    const id = randomUUID();
    
    // 1. Store the vector in Qdrant when it and an embedding model are available. If not, the
    //    backfill indexes this memory once they are.
    let vectorStored = false;
    if (await this.initQdrant()) {
      const embedding = await this.embedWithModel(content);
      if (embedding) vectorStored = await this.upsertVector(id, embedding, { workspaceId, source });
    }

    // 2. Always store in SQLite (the source of truth)
    const stmt = this.db.prepare('INSERT INTO memories (id, workspaceId, source, content) VALUES (?, ?, ?, ?)');
    stmt.run(id, workspaceId, source, content);

    // 3. Emit Event
    torvaixEvents.emitMemoryCreated({ id, workspaceId, source, content });
    console.log(`[MemoryStore] Stored memory: "${content.substring(0, 50)}..." [${vectorStored ? 'Qdrant+SQLite' : 'SQLite-only'}]`);

    return id;
  }

  /**
   * Sparse keyword search (SQLite FTS5 BM25, with a LIKE fallback).
   *
   * Scores are the share of the query's keywords found in the memory (0..1), so callers can
   * apply a meaningful relevance threshold. Previously scores were min-max normalised, so a
   * lone weak match (e.g. only the word "is") scored 1.0, and a query with no ASCII words
   * (non-English text, emoji) returned the latest memories as if they were relevant.
   */
  performKeywordSearch(workspaceId: string, query: string, limit: number = 10): MemoryQueryResult[] {
    const keywords = extractKeywords(query);
    if (keywords.length === 0) return [];

    const coverage = (content: string) => {
      const lower = content.toLowerCase();
      return Number((keywords.filter(k => lower.includes(k)).length / keywords.length).toFixed(4));
    };

    // Try FTS5 BM25 search
    try {
      const ftsQuery = keywords.map(k => `"${k}"*`).join(' OR ');
      const stmt = this.db.prepare(`
        SELECT m.id, m.content, m.source, m.createdAt, bm25(memories_fts) as bm25Score
        FROM memories_fts f
        JOIN memories m ON m.id = f.id
        WHERE f.workspaceId = ? AND memories_fts MATCH ?
        ORDER BY bm25Score ASC
        LIMIT ?
      `);
      const rows = stmt.all(workspaceId, ftsQuery, limit) as { id: string; content: string; source: string; createdAt: string; bm25Score: number }[];

      const scored = rows
        .map(r => ({ id: r.id, content: r.content, source: r.source, score: coverage(r.content), retrievalType: 'keyword' as const, createdAt: r.createdAt }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score);
      // Empty after scoring happens when the tokenizer splits a script differently from our keywords.
      if (scored.length > 0) return scored;
    } catch (e) {
      // FTS5 syntax error or fallback
    }

    // Fallback SQLite LIKE search (also covers scripts the FTS tokenizer splits poorly)
    const conditions = keywords.map(() => 'LOWER(content) LIKE ?').join(' OR ');
    const params = keywords.map(k => `%${k}%`);
    const stmt = this.db.prepare(
      `SELECT id, content, source, createdAt FROM memories WHERE workspaceId = ? AND (${conditions}) ORDER BY createdAt DESC LIMIT ?`
    );
    const rows = stmt.all(workspaceId, ...params, limit) as { id: string; content: string; source: string; createdAt: string }[];

    return rows
      .map(row => ({ id: row.id, content: row.content, source: row.source, score: coverage(row.content), retrievalType: 'keyword' as const, createdAt: row.createdAt }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Reciprocal Rank Fusion (RRF) to merge dense (vector) and sparse (keyword) search results.
   * RRF score formula: RRF(d) = sum_{m in rankers} w_m / (k + rank_m(d))
   */
  reciprocalRankFusion(
    vectorResults: MemoryQueryResult[],
    keywordResults: MemoryQueryResult[],
    topK: number = 5,
    kConstant: number = 60,
    weights = { vector: 1.0, keyword: 1.0 }
  ): MemoryQueryResult[] {
    const scoreMap = new Map<string, { item: MemoryQueryResult; rrfScore: number; sources: Set<string> }>();

    vectorResults.forEach((item, index) => {
      const rank = index + 1;
      const rankScore = weights.vector / (kConstant + rank);
      const existing = scoreMap.get(item.id);
      if (existing) {
        existing.rrfScore += rankScore;
        existing.sources.add('vector');
      } else {
        scoreMap.set(item.id, {
          item: { ...item },
          rrfScore: rankScore,
          sources: new Set(['vector']),
        });
      }
    });

    keywordResults.forEach((item, index) => {
      const rank = index + 1;
      const rankScore = weights.keyword / (kConstant + rank);
      const existing = scoreMap.get(item.id);
      if (existing) {
        existing.rrfScore += rankScore;
        existing.sources.add('keyword');
      } else {
        scoreMap.set(item.id, {
          item: { ...item },
          rrfScore: rankScore,
          sources: new Set(['keyword']),
        });
      }
    });

    const fusedList = Array.from(scoreMap.values()).sort((a, b) => b.rrfScore - a.rrfScore);
    const maxRRF = fusedList.length > 0 ? fusedList[0].rrfScore : 1;

    return fusedList.slice(0, topK).map(({ item, rrfScore, sources }) => {
      const type: 'vector' | 'keyword' | 'hybrid_rrf' =
        sources.has('vector') && sources.has('keyword')
          ? 'hybrid_rrf'
          : sources.has('vector')
          ? 'vector'
          : 'keyword';

      return {
        id: item.id,
        content: item.content,
        source: item.source,
        score: Number((rrfScore / maxRRF).toFixed(4)),
        retrievalType: type,
        createdAt: item.createdAt,
      };
    });
  }

  /**
   * Finds the memories that best match `query`. Each result counts as a recall (it feeds the
   * "recalls" numbers and theme importance) unless `record` is false, which the inspector pages
   * use so that trying out searches doesn't change those numbers.
   */
  async queryMemory(workspaceId: string, query: string, topK: number = 5, options: { record?: boolean } = {}): Promise<MemoryQueryResult[]> {
    let vectorResults: MemoryQueryResult[] = [];

    // 1. Dense vector search via Qdrant, comparing only vectors from the same embedding model
    if (typeof query === 'string' && query.trim() && (await this.initQdrant())) {
      const embedding = await this.embedWithModel(query);
      const sizeMatches = embedding && (this.collectionVectorSize === null || embedding.vector.length === this.collectionVectorSize);
      if (embedding && sizeMatches) {
        try {
          const searchResults = await this.qdrant.search(this.collectionName, {
            vector: embedding.vector,
            limit: topK * 2,
            filter: {
              must: [
                { key: 'workspaceId', match: { value: workspaceId } },
                { key: 'embedModel', match: { value: embedding.model } },
              ],
            },
          });

          const stmt = this.db.prepare('SELECT content, createdAt FROM memories WHERE id = ?');
          for (const point of searchResults) {
            const row = stmt.get(point.id) as { content: string; createdAt: string } | undefined;
            if (row) {
              vectorResults.push({
                id: String(point.id),
                content: row.content,
                source: String(point.payload?.source ?? 'unknown'),
                score: point.score,
                retrievalType: 'vector',
                createdAt: row.createdAt,
              });
            }
          }
          console.log(`[MemoryStore] Vector search returned ${vectorResults.length} candidates (source: ${this.embedSource})`);
        } catch (e) {
          console.warn('[MemoryStore] Qdrant search failed, proceeding with keyword retrieval:', e);
        }
      }
    }

    // 2. Sparse Keyword Search via SQLite FTS5 / BM25
    const keywordResults = typeof query === 'string' ? this.performKeywordSearch(workspaceId, query, topK * 2) : [];

    // 3. Fused Hybrid Retrieval using Reciprocal Rank Fusion (RRF)
    let results: MemoryQueryResult[];

    if (vectorResults.length > 0 && keywordResults.length > 0) {
      results = this.reciprocalRankFusion(vectorResults, keywordResults, topK);
      console.log(`[MemoryStore] Fused RRF returned ${results.length} hybrid results`);
    } else if (vectorResults.length > 0) {
      results = vectorResults.slice(0, topK);
    } else {
      results = keywordResults.slice(0, topK);
    }

    // 4. Record access stats for retrieved items
    const updateStatsStmt = this.db.prepare(
      'UPDATE memories SET lastAccessedAt = CURRENT_TIMESTAMP, retrievalCount = retrievalCount + 1 WHERE id = ?'
    );
    if (options.record !== false) {
      for (const r of results) {
        updateStatsStmt.run(r.id);
      }
    }

    return results;
  }

  async getAllMemories(workspaceId: string) {
    const stmt = this.db.prepare('SELECT * FROM memories WHERE workspaceId = ? ORDER BY createdAt DESC');
    return stmt.all(workspaceId);
  }

  async getMemoryById(id: string) {
    const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
    return stmt.get(id);
  }

  async updateMemory(id: string, newContent: string): Promise<void> {
    const stmt = this.db.prepare('SELECT workspaceId, source FROM memories WHERE id = ?');
    const row = stmt.get(id) as { workspaceId: string; source: string } | undefined;
    if (!row) throw new Error(`Memory with ID ${id} not found`);

    if (await this.initQdrant()) {
      const embedding = await this.embedWithModel(newContent);
      const stored = embedding && (await this.upsertVector(id, embedding, { workspaceId: row.workspaceId, source: row.source }));
      if (!stored) {
        // Never leave the old text's vector behind: the backfill re-adds it with the new text.
        await this.qdrant.delete(this.collectionName, { wait: true, points: [id] }).catch(() => {});
      }
    }

    const updateStmt = this.db.prepare('UPDATE memories SET content = ? WHERE id = ?');
    updateStmt.run(newContent, id);
    torvaixEvents.emitMemoryUpdated({ id, workspaceId: row.workspaceId, newContent });
  }

  async deleteMemory(id: string): Promise<void> {
    const row = this.db.prepare('SELECT workspaceId FROM memories WHERE id = ?').get(id) as { workspaceId: string } | undefined;
    if (!row) return; // nothing to delete, so no MEMORY_DELETED event either

    if (await this.initQdrant()) {
      try {
        await this.qdrant.delete(this.collectionName, { wait: true, points: [id] });
      } catch (e) {
        console.warn('[MemoryStore] Qdrant delete failed:', e);
      }
    }

    const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?');
    stmt.run(id);
    torvaixEvents.emitMemoryDeleted({ id, workspaceId: row.workspaceId });
  }

  // ── Workspace Methods ──

  /** Close the SQLite handle (call on shutdown). */
  close(): void {
    try {
      this.db.close();
    } catch {
      // already closed
    }
  }

  createWorkspace(name: string, settings: any = {}, forceId?: string): string {
    const id = forceId || randomUUID();

    // Agent tools run inside settings.path, so it is always provisioned here, never taken from input.
    const workspaceSettings = { ...settings, path: this.provisionWorkspaceFolder(name, id) };

    const stmt = this.db.prepare('INSERT INTO workspaces (id, name, settings) VALUES (?, ?, ?)');
    stmt.run(id, name, JSON.stringify(workspaceSettings));
    return id;
  }

  /** Directory that holds every workspace's tool folder. */
  private workspacesRoot(): string {
    const os = require('os');
    const path = require('path');
    return path.resolve(process.env.TORVAIX_HOME || path.join(os.homedir(), '.torvaix'), 'workspaces');
  }

  /**
   * Create a workspace's tool folder and return its absolute path. The folder name comes from
   * untrusted input (workspace name and a client-chosen id), so it is reduced to a safe slug and
   * every resolved path must stay inside the workspaces root before anything is created.
   */
  private provisionWorkspaceFolder(name: string, id: string): string {
    const path = require('path');
    const fs = require('fs');

    const root = this.workspacesRoot();
    const slug = String(name).toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'workspace';
    const safeId = String(id).replace(/[^A-Za-z0-9_-]/g, '').substring(0, 8) || 'ws';
    const workspacePath = path.resolve(root, `${slug}-${safeId}`);
    if (!workspacePath.startsWith(root + path.sep)) {
      throw new Error('Workspace folder resolves outside the workspaces root');
    }

    for (const sub of ['projects', 'knowledge', 'tasks']) {
      const subPath = path.resolve(workspacePath, sub);
      if (!subPath.startsWith(root + path.sep)) {
        throw new Error('Workspace folder resolves outside the workspaces root');
      }
      fs.mkdirSync(subPath, { recursive: true });
    }
    return workspacePath;
  }

  /**
   * Folder where tools run for a workspace. Rows without one (the seeded "default" workspace,
   * or rows from older versions) get a folder provisioned and saved, so shell and file tools
   * never fall back to the server's own working directory, i.e. the Torvaix source tree.
   */
  ensureWorkspacePath(id: string): string {
    const path = require('path');
    const fs = require('fs');

    this.ensureWorkspaceRow(id);
    const workspace = this.getWorkspace(id);
    let settings: any = {};
    try {
      settings = workspace?.settings ? JSON.parse(workspace.settings) : {};
    } catch {
      settings = {};
    }

    // Only trust a saved path that resolves inside the workspaces root. Anything else
    // (e.g. "/" or "~/.ssh" written by an older version) gets a fresh folder.
    const root = this.workspacesRoot();
    if (typeof settings.path === 'string' && settings.path) {
      const resolved = path.resolve(settings.path);
      if (resolved.startsWith(root + path.sep)) {
        fs.mkdirSync(resolved, { recursive: true });
        return resolved;
      }
      console.warn(`[MemoryStore] Ignoring workspace path outside ${root} for workspace ${id}`);
    }

    const workspacePath = this.provisionWorkspaceFolder(workspace?.name ?? 'workspace', id);
    if (workspace) {
      settings.path = workspacePath;
      this.db.prepare('UPDATE workspaces SET settings = ? WHERE id = ?').run(JSON.stringify(settings), id);
    }
    return workspacePath;
  }

  /**
   * Pending actions, execution logs, automations and conversations reference `workspaces(id)`.
   * The web app creates workspaces in the browser and registers them here afterwards, so a
   * workspace made while the agent was offline (or after its data folder was reset) had no row,
   * and those writes failed with "FOREIGN KEY constraint failed".
   */
  private ensureWorkspaceRow(id: string): void {
    this.db.prepare("INSERT OR IGNORE INTO workspaces (id, name) VALUES (?, 'Workspace')").run(id);
  }

  getWorkspace(id: string): Workspace | undefined {
    const stmt = this.db.prepare('SELECT * FROM workspaces WHERE id = ?');
    return stmt.get(id) as Workspace | undefined;
  }

  listWorkspaces(): Workspace[] {
    const stmt = this.db.prepare('SELECT * FROM workspaces ORDER BY createdAt DESC');
    return stmt.all() as Workspace[];
  }

  // ── Conversation Methods ──

  createConversation(workspaceId: string, title: string): string {
    const id = randomUUID();
    this.ensureWorkspaceRow(workspaceId);
    const stmt = this.db.prepare('INSERT INTO conversations (id, workspaceId, title) VALUES (?, ?, ?)');
    stmt.run(id, workspaceId, title);
    return id;
  }

  listConversations(workspaceId: string): Conversation[] {
    const stmt = this.db.prepare('SELECT * FROM conversations WHERE workspaceId = ? ORDER BY createdAt DESC');
    return stmt.all(workspaceId) as Conversation[];
  }

  // ── Pending Actions (Security) ──

  createPendingAction(workspaceId: string, action: string, params: any): string {
    const id = randomUUID();
    this.ensureWorkspaceRow(workspaceId);
    const stmt = this.db.prepare('INSERT INTO pending_actions (id, workspaceId, action, params) VALUES (?, ?, ?, ?)');
    stmt.run(id, workspaceId, action, JSON.stringify(params));
    return id;
  }

  getPendingAction(id: string): PendingAction | undefined {
    const stmt = this.db.prepare('SELECT * FROM pending_actions WHERE id = ?');
    return stmt.get(id) as PendingAction | undefined;
  }

  /** Record the user's decision. Only actions still awaiting one can change; returns false otherwise. */
  updatePendingActionStatus(id: string, status: 'approved' | 'rejected'): boolean {
    const stmt = this.db.prepare("UPDATE pending_actions SET status = ? WHERE id = ? AND status = 'pending'");
    return stmt.run(status, id).changes === 1;
  }

  /**
   * Atomically claim an approved action for execution. It must belong to `workspaceId` and
   * can be claimed once, so an approval can't be replayed to run the command again.
   */
  consumeApprovedAction(id: string, workspaceId: string): PendingAction | undefined {
    const stmt = this.db.prepare("UPDATE pending_actions SET status = 'executed' WHERE id = ? AND workspaceId = ? AND status = 'approved'");
    return stmt.run(id, workspaceId).changes === 1 ? this.getPendingAction(id) : undefined;
  }

  listPendingActions(workspaceId: string, status?: PendingAction['status']): PendingAction[] {
    if (status) {
      const stmt = this.db.prepare('SELECT * FROM pending_actions WHERE workspaceId = ? AND status = ? ORDER BY createdAt DESC');
      return stmt.all(workspaceId, status) as PendingAction[];
    }
    const stmt = this.db.prepare('SELECT * FROM pending_actions WHERE workspaceId = ? ORDER BY createdAt DESC');
    return stmt.all(workspaceId) as PendingAction[];
  }

  // ── Execution Logs ──

  logExecution(workspaceId: string, action: string, params: any, result: any, status: string) {
    const id = randomUUID();
    this.ensureWorkspaceRow(workspaceId);
    const stmt = this.db.prepare('INSERT INTO execution_logs (id, workspaceId, action, params, result, status) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(id, workspaceId, action, JSON.stringify(params), JSON.stringify(result), status);
    return id;
  }

  listExecutionLogs(workspaceId: string, limit: number = 50): ExecutionLog[] {
    const stmt = this.db.prepare('SELECT * FROM execution_logs WHERE workspaceId = ? ORDER BY createdAt DESC, rowid DESC LIMIT ?');
    return stmt.all(workspaceId, limit) as ExecutionLog[];
  }

  getMemoryStats(workspaceId: string) {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count, AVG(retrievalCount) as avgRetrieval FROM memories WHERE workspaceId = ?');
    const totalRow = totalStmt.get(workspaceId) as { count: number; avgRetrieval: number | null } | undefined;
    const timestampsStmt = this.db.prepare('SELECT MIN(createdAt) as oldest, MAX(createdAt) as newest FROM memories WHERE workspaceId = ?');
    const tsRow = timestampsStmt.get(workspaceId) as { oldest: string | null; newest: string | null } | undefined;
    return {
      total: totalRow?.count ?? 0,
      avgRetrieval: totalRow?.avgRetrieval ? Number(totalRow.avgRetrieval.toFixed(2)) : 0,
      oldest: tsRow?.oldest ?? null,
      newest: tsRow?.newest ?? null,
    };
  }

  // ── Automation Workflows & Logs ──

  createAutomation(params: {
    id?: string;
    workspaceId: string;
    name: string;
    description?: string;
    triggerType: 'schedule' | 'event' | 'manual';
    triggerConfig?: any;
    actionType: string;
    actionConfig?: any;
    status?: 'active' | 'paused' | 'draft';
  }): AutomationRecord {
    const id = params.id || randomUUID();
    const description = params.description || '';
    const triggerConfig = toConfigJson(params.triggerConfig);
    const actionConfig = toConfigJson(params.actionConfig);
    const status = params.status || 'active';
    const now = new Date().toISOString();
    this.ensureWorkspaceRow(params.workspaceId);

    const stmt = this.db.prepare(`
      INSERT INTO automations (id, workspaceId, name, description, triggerType, triggerConfig, actionType, actionConfig, status, runCount, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);
    stmt.run(id, params.workspaceId, params.name, description, params.triggerType, triggerConfig, params.actionType, actionConfig, status, now, now);

    return this.getAutomation(id)!;
  }

  getAutomation(id: string): AutomationRecord | null {
    const stmt = this.db.prepare('SELECT * FROM automations WHERE id = ?');
    const row = stmt.get(id) as AutomationRecord | undefined;
    return row || null;
  }

  listAutomations(workspaceId?: string): AutomationRecord[] {
    if (workspaceId) {
      const stmt = this.db.prepare('SELECT * FROM automations WHERE workspaceId = ? ORDER BY createdAt DESC');
      return stmt.all(workspaceId) as AutomationRecord[];
    }
    const stmt = this.db.prepare('SELECT * FROM automations ORDER BY createdAt DESC');
    return stmt.all() as AutomationRecord[];
  }

  updateAutomation(id: string, updates: Partial<{
    name: string;
    description: string;
    triggerType: 'schedule' | 'event' | 'manual';
    triggerConfig: any;
    actionType: string;
    actionConfig: any;
    status: 'active' | 'paused' | 'draft';
    lastRunAt: string;
    runCount: number;
    updatedAt: string;
  }>): boolean {
    const existing = this.getAutomation(id);
    if (!existing) return false;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.triggerType !== undefined) { fields.push('triggerType = ?'); values.push(updates.triggerType); }
    if (updates.triggerConfig !== undefined) {
      fields.push('triggerConfig = ?');
      values.push(toConfigJson(updates.triggerConfig));
    }
    if (updates.actionType !== undefined) { fields.push('actionType = ?'); values.push(updates.actionType); }
    if (updates.actionConfig !== undefined) {
      fields.push('actionConfig = ?');
      values.push(toConfigJson(updates.actionConfig));
    }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.lastRunAt !== undefined) { fields.push('lastRunAt = ?'); values.push(updates.lastRunAt); }
    if (updates.runCount !== undefined) { fields.push('runCount = ?'); values.push(updates.runCount); }

    fields.push('updatedAt = ?');
    values.push(updates.updatedAt || new Date().toISOString());

    values.push(id);

    const stmt = this.db.prepare(`UPDATE automations SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return true;
  }

  deleteAutomation(id: string): boolean {
    const deleteLogs = this.db.prepare('DELETE FROM automation_logs WHERE automationId = ?');
    deleteLogs.run(id);
    const stmt = this.db.prepare('DELETE FROM automations WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  logAutomationRun(log: {
    id?: string;
    automationId: string;
    workspaceId: string;
    status: 'running' | 'success' | 'error' | string;
    output?: string;
    durationMs?: number;
    startedAt: string;
    completedAt?: string;
  }): AutomationLogRecord {
    const id = log.id || randomUUID();
    const output = log.output || '';
    const durationMs = log.durationMs || 0;
    const completedAt = log.completedAt || new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO automation_logs (id, automationId, workspaceId, status, output, durationMs, startedAt, completedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, log.automationId, log.workspaceId, log.status, output, durationMs, log.startedAt, completedAt);

    return {
      id,
      automationId: log.automationId,
      workspaceId: log.workspaceId,
      status: log.status as any,
      output,
      durationMs,
      startedAt: log.startedAt,
      completedAt
    };
  }

  listAutomationLogs(automationId: string, limit = 50): AutomationLogRecord[] {
    const stmt = this.db.prepare('SELECT * FROM automation_logs WHERE automationId = ? ORDER BY startedAt DESC, rowid DESC LIMIT ?');
    return stmt.all(automationId, limit) as AutomationLogRecord[];
  }

  getAutomationStats(workspaceId?: string) {
    const filter = workspaceId ? 'WHERE workspaceId = ?' : '';
    const totalStmt = this.db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) as paused, SUM(runCount) as totalRuns FROM automations ${filter}`);
    const row = (workspaceId ? totalStmt.get(workspaceId) : totalStmt.get()) as any;

    const logFilter = workspaceId ? 'WHERE workspaceId = ?' : '';
    const logStmt = this.db.prepare(`SELECT SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failed FROM automation_logs ${logFilter}`);
    const logRow = (workspaceId ? logStmt.get(workspaceId) : logStmt.get()) as any;

    return {
      totalAutomations: row?.total || 0,
      activeCount: row?.active || 0,
      pausedCount: row?.paused || 0,
      totalRuns: row?.totalRuns || 0,
      successfulRuns: logRow?.successful || 0,
      failedRuns: logRow?.failed || 0,
    };
  }

  /**
   * Earlier versions seeded these with names and descriptions that overstated what they do
   * ("deduplicate and strengthen connections" for a read-only report). Rename the ones the user
   * hasn't edited; anything renamed or reworded by the user no longer matches and is left alone.
   */
  private renameLegacyDefaultAutomations(): void {
    const renames: [string, string, string, string][] = [
      [
        'Autonomous Memory Consolidation',
        'Review recent conversation memories, deduplicate, and strengthen important connections in the knowledge graph.',
        'Weekly memory themes',
        "Looks over this workspace's memories and reports the themes and likely duplicates it finds. It doesn't change anything.",
      ],
      [
        'Workspace Knowledge Graph Indexer',
        'When new knowledge is added, automatically analyze relationships and synthesize updated graph entity edges.',
        'Keep the knowledge graph up to date',
        'Each time a memory is saved, links related topics in the knowledge graph.',
      ],
      [
        'Daily Research Digest',
        'Every morning, search for new papers and updates on AI deployment and summarize key insights.',
        'Daily research digest',
        "An example agent task: every morning, search the web for a topic and summarise what's new. Paused until you edit the instructions and turn it on.",
      ],
    ];
    const stmt = this.db.prepare('UPDATE automations SET name = ?, description = ? WHERE name = ? AND description = ?');
    for (const [oldName, oldDescription, name, description] of renames) stmt.run(name, description, oldName, oldDescription);
  }

  seedDefaultAutomations(workspaceId = 'default'): void {
    this.renameLegacyDefaultAutomations();
    const existing = this.listAutomations(workspaceId);
    if (existing.length > 0) return;

    this.createAutomation({
      workspaceId,
      name: 'Weekly memory themes',
      description: 'Looks over this workspace\'s memories and reports the themes and likely duplicates it finds. It doesn\'t change anything.',
      triggerType: 'schedule',
      triggerConfig: { frequency: 'weekly', dayOfWeek: 0, timeOfDay: '02:00' },
      actionType: 'consolidate_memory',
      actionConfig: {},
      status: 'active'
    });

    this.createAutomation({
      workspaceId,
      name: 'Keep the knowledge graph up to date',
      description: 'Each time a memory is saved, links related topics in the knowledge graph.',
      triggerType: 'event',
      triggerConfig: { eventName: 'MEMORY_CREATED' },
      actionType: 'synthesize_graph',
      actionConfig: {},
      status: 'active'
    });

    this.createAutomation({
      workspaceId,
      name: 'Daily research digest',
      description: 'An example agent task: every morning, search the web for a topic and summarise what\'s new. Paused until you edit the instructions and turn it on.',
      triggerType: 'schedule',
      triggerConfig: { frequency: 'daily', timeOfDay: '09:00' },
      actionType: 'agent_task',
      actionConfig: { prompt: 'Search the web for the latest news about local AI models and summarise the three most important developments.' },
      status: 'paused'
    });
  }

  // ── Custom Agents & Runs ──

  createAgent(params: {
    id?: string;
    workspaceId: string;
    name: string;
    description?: string;
    instructions: string;
    tools: string[];
  }): AgentRecord {
    const id = params.id || randomUUID();
    const now = new Date().toISOString();
    this.ensureWorkspaceRow(params.workspaceId);
    this.db.prepare(`
      INSERT INTO agents (id, workspaceId, name, description, instructions, tools, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, params.workspaceId, params.name, params.description ?? '', params.instructions, JSON.stringify(params.tools), now, now);
    return this.getAgent(id)!;
  }

  getAgent(id: string): AgentRecord | null {
    const row = this.db.prepare(`${AGENT_SELECT} WHERE a.id = ?`).get(id) as (Omit<AgentRecord, 'tools'> & { tools: string }) | undefined;
    return row ? { ...row, tools: parseAgentTools(row.tools) } : null;
  }

  /** A workspace's agents in the order they were made, each with how often it has run. */
  listAgents(workspaceId: string): AgentRecord[] {
    const rows = this.db.prepare(`${AGENT_SELECT} WHERE a.workspaceId = ? ORDER BY a.createdAt ASC, a.rowid ASC`)
      .all(workspaceId) as (Omit<AgentRecord, 'tools'> & { tools: string })[];
    return rows.map(row => ({ ...row, tools: parseAgentTools(row.tools) }));
  }

  countAgents(workspaceId: string): number {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM agents WHERE workspaceId = ?').get(workspaceId) as { c: number };
    return row.c;
  }

  /** Changes the given fields and returns the agent, or null if there is no such agent. */
  updateAgent(id: string, updates: Partial<{
    name: string;
    description: string;
    instructions: string;
    tools: string[];
  }>): AgentRecord | null {
    if (!this.getAgent(id)) return null;

    const fields: string[] = [];
    const values: any[] = [];
    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.instructions !== undefined) { fields.push('instructions = ?'); values.push(updates.instructions); }
    if (updates.tools !== undefined) { fields.push('tools = ?'); values.push(JSON.stringify(updates.tools)); }
    // Nothing to change means nothing was edited, so the edit time stays as it was.
    if (fields.length > 0) {
      fields.push('updatedAt = ?');
      values.push(new Date().toISOString(), id);
      this.db.prepare(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    return this.getAgent(id);
  }

  /** Deletes the agent and its runs. Returns false if there was no such agent. */
  deleteAgent(id: string): boolean {
    return this.db.transaction(() => {
      this.db.prepare('DELETE FROM agent_runs WHERE agentId = ?').run(id);
      return this.db.prepare('DELETE FROM agents WHERE id = ?').run(id).changes > 0;
    })();
  }

  /**
   * Every workspace gets these once. Seeding is recorded in the workspace's settings, so an
   * agent the user deletes is not brought back the next time the list is opened.
   */
  seedDefaultAgents(workspaceId = 'default'): void {
    this.ensureWorkspaceRow(workspaceId);
    let settings: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(this.getWorkspace(workspaceId)?.settings || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) settings = parsed;
    } catch { /* unreadable settings are treated as empty */ }
    if (settings.agentsSeeded === true) return;

    this.db.transaction(() => {
      for (const starter of DEFAULT_AGENTS) this.createAgent({ workspaceId, ...starter });
      settings.agentsSeeded = true;
      this.db.prepare('UPDATE workspaces SET settings = ? WHERE id = ?').run(JSON.stringify(settings), workspaceId);
    })();
  }

  createAgentRun(params: {
    id?: string;
    agentId: string;
    workspaceId: string;
    task: string;
    status: AgentRunStatus;
    output?: string;
    pendingActionId?: string | null;
    context?: AgentContextMessage[];
    durationMs?: number;
  }): AgentRunRecord {
    const id = params.id || randomUUID();
    const now = new Date().toISOString();
    this.ensureWorkspaceRow(params.workspaceId);
    this.db.prepare(`
      INSERT INTO agent_runs (id, agentId, workspaceId, task, status, output, pendingActionId, context, durationMs, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, params.agentId, params.workspaceId, params.task, params.status, params.output ?? '',
      params.pendingActionId ?? null, JSON.stringify(capAgentContext(params.context ?? [])),
      Math.round(params.durationMs ?? 0), now, now
    );
    const { context: _context, ...run } = this.getAgentRun(id)!;
    return run;
  }

  /** Saves how a run ended (or paused). Returns the run, or null if it no longer exists. */
  updateAgentRun(id: string, updates: Partial<{
    status: AgentRunStatus;
    output: string;
    pendingActionId: string | null;
    context: AgentContextMessage[];
    durationMs: number;
  }>): AgentRunRecord | null {
    const fields: string[] = [];
    const values: any[] = [];
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.output !== undefined) { fields.push('output = ?'); values.push(updates.output); }
    if (updates.pendingActionId !== undefined) { fields.push('pendingActionId = ?'); values.push(updates.pendingActionId); }
    if (updates.context !== undefined) { fields.push('context = ?'); values.push(JSON.stringify(capAgentContext(updates.context))); }
    if (updates.durationMs !== undefined) { fields.push('durationMs = ?'); values.push(Math.round(updates.durationMs)); }
    fields.push('updatedAt = ?');
    values.push(new Date().toISOString(), id);

    if (this.db.prepare(`UPDATE agent_runs SET ${fields.join(', ')} WHERE id = ?`).run(...values).changes === 0) return null;
    const { context: _context, ...run } = this.getAgentRun(id)!;
    return run;
  }

  getAgentRun(id: string): AgentRunDetail | null {
    const row = this.db.prepare(`SELECT ${AGENT_RUN_COLUMNS}, context FROM agent_runs WHERE id = ?`).get(id) as (AgentRunRecord & { context: string }) | undefined;
    return row ? { ...row, context: parseAgentContext(row.context) } : null;
  }

  /** The run that is waiting for this action to be approved, if any. */
  getAgentRunByPendingAction(pendingActionId: string): AgentRunDetail | null {
    const row = this.db.prepare(`SELECT ${AGENT_RUN_COLUMNS}, context FROM agent_runs WHERE pendingActionId = ?`).get(pendingActionId) as (AgentRunRecord & { context: string }) | undefined;
    return row ? { ...row, context: parseAgentContext(row.context) } : null;
  }

  /** An agent's runs, newest first. The history a run keeps for continuing is not included. */
  listAgentRuns(agentId: string, limit = 20): AgentRunRecord[] {
    return this.db.prepare(`SELECT ${AGENT_RUN_COLUMNS} FROM agent_runs WHERE agentId = ? ORDER BY createdAt DESC, rowid DESC LIMIT ?`)
      .all(agentId, Math.max(1, Math.trunc(limit))) as AgentRunRecord[];
  }


  // ── User Management (Auth Hardening) ──

  createUser(username: string, email: string, passwordHash: string): string {
    const id = randomUUID();
    const stmt = this.db.prepare('INSERT INTO users (id, username, email, passwordHash) VALUES (?, ?, ?, ?)');
    stmt.run(id, username, email, passwordHash);
    return id;
  }

  getUserByEmail(email: string): { id: string; username: string; email: string; passwordHash: string } | undefined {
    const stmt = this.db.prepare('SELECT id, username, email, passwordHash FROM users WHERE email = ?');
    return stmt.get(email) as any;
  }

  getUserById(id: string): { id: string; username: string; email: string } | undefined {
    const stmt = this.db.prepare('SELECT id, username, email FROM users WHERE id = ?');
    return stmt.get(id) as any;
  }

  touchUserLogin(id: string) {
    const stmt = this.db.prepare('UPDATE users SET lastLogin = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(id);
  }

  // ── Companion Layer (Experimental) ──

  createPairingToken(scope: 'readonly' | 'admin' = 'readonly', expiryMinutes: number = 10): { id: string; token: string } {
    const id = randomUUID();
    const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
    const stmt = this.db.prepare('INSERT INTO companion_tokens (id, token, scope, expiresAt) VALUES (?, ?, ?, ?)');
    stmt.run(id, token, scope, expiresAt);
    return { id, token };
  }

  claimPairingToken(token: string, deviceName: string, fingerprint: string): string | null {
    const stmt = this.db.prepare('SELECT * FROM companion_tokens WHERE token = ? AND revoked = 0');
    const row = stmt.get(token) as any;
    if (!row) return null;
    if (new Date(row.expiresAt) < new Date()) return null;
    if (row.claimedByDeviceId) return null;

    const deviceId = randomUUID();
    // Claim the token and register the device atomically. A fingerprint that is already paired
    // is rejected: returning the existing device let any valid token (even readonly) take over
    // another device, including an admin one.
    const claim = this.db.transaction(() => {
      const claimed = this.db
        .prepare('UPDATE companion_tokens SET claimedByDeviceId = ? WHERE id = ? AND claimedByDeviceId IS NULL AND revoked = 0')
        .run(deviceId, row.id).changes === 1;
      if (!claimed) return null;
      this.db.prepare('INSERT INTO companion_devices (id, name, fingerprint, scope) VALUES (?, ?, ?, ?)')
        .run(deviceId, deviceName, fingerprint, row.scope);
      return deviceId;
    });
    try {
      return claim();
    } catch {
      return null; // fingerprint already paired: transaction rolled back, token stays unclaimed
    }
  }

  createDeviceSession(deviceId: string, expiryHours: number = 24): string | null {
    const device = this.db.prepare('SELECT * FROM companion_devices WHERE id = ? AND revoked = 0').get(deviceId) as any;
    if (!device) return null;

    const sessionToken = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    const sessionExpiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

    const stmt = this.db.prepare('UPDATE companion_devices SET sessionToken = ?, sessionExpiresAt = ?, lastSeenAt = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(sessionToken, sessionExpiresAt, deviceId);
    return sessionToken;
  }

  validateSession(sessionToken: string): { deviceId: string; scope: string; name: string } | null {
    const stmt = this.db.prepare('SELECT * FROM companion_devices WHERE sessionToken = ? AND revoked = 0');
    const device = stmt.get(sessionToken) as any;
    if (!device) return null;
    if (new Date(device.sessionExpiresAt) < new Date()) return null;

    this.db.prepare('UPDATE companion_devices SET lastSeenAt = CURRENT_TIMESTAMP WHERE id = ?').run(device.id);
    return { deviceId: device.id, scope: device.scope, name: device.name };
  }

  revokeDevice(deviceId: string) {
    this.db.prepare('UPDATE companion_devices SET revoked = 1, sessionToken = NULL WHERE id = ?').run(deviceId);
  }

  listCompanionDevices(): any[] {
    return this.db.prepare('SELECT id, name, fingerprint, scope, lastSeenAt, revoked, createdAt FROM companion_devices ORDER BY createdAt DESC').all();
  }
}
