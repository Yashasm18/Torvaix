/**
 * Torvaix Memory Store
 *
 * Dual-layer vector memory system:
 * - Primary: Qdrant vector search with Ollama embeddings
 * - Fallback 1: OpenAI embeddings (if Ollama unavailable and API key present)
 * - Fallback 2: Deterministic local keyword embedding (no external deps)
 * - Source of truth: SQLite
 *
 * Also manages workspaces, conversations, pending actions, execution logs,
 * and companion device pairing.
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
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
  status: 'pending' | 'approved' | 'rejected';
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


/** Which embedding source is active. */
export type EmbedSource = 'ollama' | 'openai' | 'local' | 'none';

export class MemoryStore {
  private db: Database.Database;
  private qdrant: QdrantClient;
  private qdrantAvailable = false;
  private qdrantChecked = false;
  private collectionName = 'torvaix_memories';
  private embedModel = 'nomic-embed-text';
  private ollamaUrl: string;
  private ollamaAvailable = false;
  private ollamaChecked = false;
  private embedSource: EmbedSource = 'none';
  private vectorSize = 768; // default for nomic-embed-text

  constructor(dbPath: string, options?: { ollamaUrl?: string; qdrantUrl?: string }) {
    this.db = new Database(dbPath);
    this.ollamaUrl = options?.ollamaUrl ?? process.env.OLLAMA_URL ?? 'http://localhost:11434';
    const qdrantUrl = options?.qdrantUrl ?? process.env.QDRANT_URL ?? 'http://localhost:6333';
    this.qdrant = new QdrantClient({ url: qdrantUrl });
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
    
    // Populate FTS5 table for any pre-existing rows
    try {
      this.db.exec(`INSERT OR IGNORE INTO memories_fts(id, workspaceId, content) SELECT id, workspaceId, content FROM memories;`);
    } catch (e) { /* Ignore if already populated or FTS error */ }
    
    // Attempt to alter table if the columns don't exist (for existing dev databases)
    try {
      this.db.exec(`ALTER TABLE memories ADD COLUMN lastAccessedAt DATETIME DEFAULT CURRENT_TIMESTAMP;`);
    } catch (e) { /* Column might already exist */ }
    try {
      this.db.exec(`ALTER TABLE memories ADD COLUMN retrievalCount INTEGER DEFAULT 0;`);
    } catch (e) { /* Column might already exist */ }

    // Ensure default workspace exists to avoid FOREIGN KEY constraints failing
    this.db.exec(`INSERT OR IGNORE INTO workspaces (id, name) VALUES ('default', 'Default Workspace');`);
  }

  // ── Qdrant ──

  async initQdrant(): Promise<boolean> {
    if (this.qdrantChecked) return this.qdrantAvailable;
    this.qdrantChecked = true;

    try {
      const result = await this.qdrant.getCollections();
      const exists = result.collections.some(c => c.name === this.collectionName);

      if (!exists) {
        // Detect vector size from active embedding source
        const testVector = await this.generateEmbedding('test');
        this.vectorSize = testVector?.length ?? 768;

        await this.qdrant.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: 'Cosine',
          },
        });
        console.log(`[MemoryStore] Created Qdrant collection: ${this.collectionName} (dim=${this.vectorSize})`);
      }

      this.qdrantAvailable = true;
      console.log('[MemoryStore] Qdrant connected successfully');
    } catch (e) {
      this.qdrantAvailable = false;
      console.warn('[MemoryStore] Qdrant unavailable — falling back to SQLite-only mode');
    }

    return this.qdrantAvailable;
  }

  // ── Embedding Chain: Ollama → OpenAI → Local ──

  private async checkOllama(): Promise<boolean> {
    if (this.ollamaChecked) return this.ollamaAvailable;
    this.ollamaChecked = true;

    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      if (response.ok) {
        this.ollamaAvailable = true;
        this.embedSource = 'ollama';
        console.log('[MemoryStore] Ollama connected successfully');
      }
    } catch (e) {
      this.ollamaAvailable = false;
      console.warn('[MemoryStore] Ollama unavailable');
    }
    return this.ollamaAvailable;
  }

  async generateEmbedding(text: string): Promise<number[] | null> {
    // Try 1: Ollama (local, privacy-first)
    const ollamaOk = await this.checkOllama();
    if (ollamaOk) {
      try {
        const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.embedModel, prompt: text }),
        });
        if (response.ok) {
          const data = await response.json();
          if (data.embedding) {
            this.embedSource = 'ollama';
            return data.embedding;
          }
        }
      } catch (e) {
        console.warn('[MemoryStore] Ollama embedding failed:', e);
      }
    }

    // Try 2: OpenAI embeddings (if API key available)
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
        });
        if (response.ok) {
          const data = await response.json();
          const embedding = data.data?.[0]?.embedding;
          if (embedding) {
            this.embedSource = 'openai';
            this.vectorSize = embedding.length; // 1536 for text-embedding-3-small
            return embedding;
          }
        }
      } catch (e) {
        console.warn('[MemoryStore] OpenAI embedding fallback failed:', e);
      }
    }

    // Try 3: Deterministic local keyword embedding (no ML, no network)
    this.embedSource = 'local';
    return this.localKeywordEmbedding(text);
  }

  /** Deterministic local embedding — no ML, no network, always available. */
  private localKeywordEmbedding(text: string): number[] {
    const dims = this.vectorSize;
    const vec = new Float32Array(dims);
    const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 2);

    for (const word of words) {
      // Distribute word hashes across dimensions
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
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
    const id = uuidv4();
    
    // 1. Try to store vector in Qdrant (if available)
    await this.initQdrant();
    if (this.qdrantAvailable) {
      const vector = await this.generateEmbedding(content);
      if (vector) {
        try {
          // Ensure collection has correct dimensions
          if (vector.length !== this.vectorSize) {
            this.vectorSize = vector.length;
          }
          await this.qdrant.upsert(this.collectionName, {
            wait: true,
            points: [{ id, vector, payload: { workspaceId, source } }],
          });
        } catch (e) {
          console.warn('[MemoryStore] Qdrant upsert failed, storing in SQLite only:', e);
        }
      }
    }

    // 2. Always store in SQLite (the source of truth)
    const stmt = this.db.prepare('INSERT INTO memories (id, workspaceId, source, content) VALUES (?, ?, ?, ?)');
    stmt.run(id, workspaceId, source, content);

    // 3. Emit Event
    torvaixEvents.emitMemoryCreated({ id, workspaceId, source, content });
    console.log(`[MemoryStore] Stored memory: "${content.substring(0, 50)}..." [${this.qdrantAvailable ? 'Qdrant+SQLite' : 'SQLite-only'}]`);

    return id;
  }

  /** Perform sparse keyword search using SQLite FTS5 BM25 or fallback LIKE search. */
  performKeywordSearch(workspaceId: string, query: string, limit: number = 10): MemoryQueryResult[] {
    const sanitized = query.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
    const keywords = sanitized.toLowerCase().split(/\s+/).filter(w => w.length > 1);

    if (keywords.length === 0) {
      const stmt = this.db.prepare('SELECT id, content, source FROM memories WHERE workspaceId = ? ORDER BY createdAt DESC LIMIT ?');
      const rows = stmt.all(workspaceId, limit) as { id: string; content: string; source: string }[];
      return rows.map(r => ({ ...r, score: 0.5, retrievalType: 'keyword' as const }));
    }

    // Try FTS5 BM25 search
    try {
      const ftsQuery = keywords.map(k => `"${k}"*`).join(' OR ');
      const stmt = this.db.prepare(`
        SELECT m.id, m.content, m.source, bm25(memories_fts) as bm25Score
        FROM memories_fts f
        JOIN memories m ON m.id = f.id
        WHERE f.workspaceId = ? AND memories_fts MATCH ?
        ORDER BY bm25Score ASC
        LIMIT ?
      `);
      const rows = stmt.all(workspaceId, ftsQuery, limit) as { id: string; content: string; source: string; bm25Score: number }[];

      if (rows.length > 0) {
        const minBm25 = Math.min(...rows.map(r => r.bm25Score));
        const maxBm25 = Math.max(...rows.map(r => r.bm25Score));
        const range = maxBm25 - minBm25 || 1;

        return rows.map(r => ({
          id: r.id,
          content: r.content,
          source: r.source,
          score: Number((1 - (r.bm25Score - minBm25) / range).toFixed(4)),
          retrievalType: 'keyword' as const,
        }));
      }
    } catch (e) {
      // FTS5 syntax error or fallback
    }

    // Fallback SQLite LIKE search
    const conditions = keywords.map(() => 'LOWER(content) LIKE ?').join(' OR ');
    const params = keywords.map(k => `%${k}%`);
    const stmt = this.db.prepare(
      `SELECT id, content, source FROM memories WHERE workspaceId = ? AND (${conditions}) ORDER BY createdAt DESC LIMIT ?`
    );
    const rows = stmt.all(workspaceId, ...params, limit) as { id: string; content: string; source: string }[];

    return rows.map(row => {
      const lowerContent = row.content.toLowerCase();
      const matchCount = keywords.filter(k => lowerContent.includes(k)).length;
      return {
        id: row.id,
        content: row.content,
        source: row.source,
        score: matchCount / keywords.length,
        retrievalType: 'keyword' as const,
      };
    });
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
      };
    });
  }

  async queryMemory(workspaceId: string, query: string, topK: number = 5): Promise<MemoryQueryResult[]> {
    await this.initQdrant();

    let vectorResults: MemoryQueryResult[] = [];

    // 1. Dense Vector Search via Qdrant (if available)
    if (this.qdrantAvailable) {
      const vector = await this.generateEmbedding(query);
      if (vector) {
        try {
          const searchResults = await this.qdrant.search(this.collectionName, {
            vector,
            limit: topK * 2,
            filter: {
              must: [{ key: 'workspaceId', match: { value: workspaceId } }],
            },
          });

          const stmt = this.db.prepare('SELECT content FROM memories WHERE id = ?');
          for (const point of searchResults) {
            const row = stmt.get(point.id) as { content: string } | undefined;
            if (row) {
              vectorResults.push({
                id: String(point.id),
                content: row.content,
                source: String(point.payload?.source ?? 'unknown'),
                score: point.score,
                retrievalType: 'vector',
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
    const keywordResults = this.performKeywordSearch(workspaceId, query, topK * 2);

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
    for (const r of results) {
      updateStatsStmt.run(r.id);
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

    await this.initQdrant();
    if (this.qdrantAvailable) {
      const vector = await this.generateEmbedding(newContent);
      if (vector) {
        try {
          await this.qdrant.upsert(this.collectionName, {
            wait: true,
            points: [{ id, vector, payload: { workspaceId: row.workspaceId, source: row.source } }],
          });
        } catch (e) {
          console.warn('[MemoryStore] Qdrant update failed:', e);
        }
      }
    }

    const updateStmt = this.db.prepare('UPDATE memories SET content = ? WHERE id = ?');
    updateStmt.run(newContent, id);
    torvaixEvents.emitMemoryUpdated({ id, newContent });
  }

  async deleteMemory(id: string): Promise<void> {
    await this.initQdrant();
    if (this.qdrantAvailable) {
      try {
        await this.qdrant.delete(this.collectionName, { wait: true, points: [id] });
      } catch (e) {
        console.warn('[MemoryStore] Qdrant delete failed:', e);
      }
    }

    const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?');
    stmt.run(id);
    torvaixEvents.emitMemoryDeleted({ id });
  }

  // ── Workspace Methods ──

  createWorkspace(name: string, settings: any = {}, forceId?: string): string {
    const id = forceId || uuidv4();
    
    // Automatically provision workspace folder
    if (!settings.path) {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      
      const TORVAIX_HOME = process.env.TORVAIX_HOME || path.join(os.homedir(), '.torvaix');
      // Replace spaces and special chars in name to form a slug
      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      const workspacePath = path.join(TORVAIX_HOME, 'workspaces', `${slug}-${id.substring(0, 8)}`);
      
      fs.mkdirSync(workspacePath, { recursive: true });
      fs.mkdirSync(path.join(workspacePath, 'projects'), { recursive: true });
      fs.mkdirSync(path.join(workspacePath, 'knowledge'), { recursive: true });
      fs.mkdirSync(path.join(workspacePath, 'tasks'), { recursive: true });
      
      settings.path = workspacePath;
    }

    const stmt = this.db.prepare('INSERT INTO workspaces (id, name, settings) VALUES (?, ?, ?)');
    stmt.run(id, name, JSON.stringify(settings));
    return id;
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
    const id = uuidv4();
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
    const id = uuidv4();
    const stmt = this.db.prepare('INSERT INTO pending_actions (id, workspaceId, action, params) VALUES (?, ?, ?, ?)');
    stmt.run(id, workspaceId, action, JSON.stringify(params));
    return id;
  }

  getPendingAction(id: string): PendingAction | undefined {
    const stmt = this.db.prepare('SELECT * FROM pending_actions WHERE id = ?');
    return stmt.get(id) as PendingAction | undefined;
  }

  updatePendingActionStatus(id: string, status: 'approved' | 'rejected') {
    const stmt = this.db.prepare('UPDATE pending_actions SET status = ? WHERE id = ?');
    stmt.run(status, id);
  }

  listPendingActions(workspaceId: string, status?: 'pending' | 'approved' | 'rejected'): PendingAction[] {
    if (status) {
      const stmt = this.db.prepare('SELECT * FROM pending_actions WHERE workspaceId = ? AND status = ? ORDER BY createdAt DESC');
      return stmt.all(workspaceId, status) as PendingAction[];
    }
    const stmt = this.db.prepare('SELECT * FROM pending_actions WHERE workspaceId = ? ORDER BY createdAt DESC');
    return stmt.all(workspaceId) as PendingAction[];
  }

  // ── Execution Logs ──

  logExecution(workspaceId: string, action: string, params: any, result: any, status: string) {
    const id = uuidv4();
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
    const id = params.id || uuidv4();
    const description = params.description || '';
    const triggerConfig = typeof params.triggerConfig === 'string' ? params.triggerConfig : JSON.stringify(params.triggerConfig || {});
    const actionConfig = typeof params.actionConfig === 'string' ? params.actionConfig : JSON.stringify(params.actionConfig || {});
    const status = params.status || 'active';
    const now = new Date().toISOString();

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
      values.push(typeof updates.triggerConfig === 'string' ? updates.triggerConfig : JSON.stringify(updates.triggerConfig));
    }
    if (updates.actionType !== undefined) { fields.push('actionType = ?'); values.push(updates.actionType); }
    if (updates.actionConfig !== undefined) {
      fields.push('actionConfig = ?');
      values.push(typeof updates.actionConfig === 'string' ? updates.actionConfig : JSON.stringify(updates.actionConfig));
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
    const id = log.id || uuidv4();
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

  seedDefaultAutomations(workspaceId = 'default'): void {
    const existing = this.listAutomations(workspaceId);
    if (existing.length > 0) return;

    this.createAutomation({
      workspaceId,
      name: 'Autonomous Memory Consolidation',
      description: 'Review recent conversation memories, deduplicate, and strengthen important connections in the knowledge graph.',
      triggerType: 'schedule',
      triggerConfig: { frequency: 'weekly', dayOfWeek: 0, timeOfDay: '02:00' },
      actionType: 'consolidate_memory',
      actionConfig: {},
      status: 'active'
    });

    this.createAutomation({
      workspaceId,
      name: 'Workspace Knowledge Graph Indexer',
      description: 'When new knowledge is added, automatically analyze relationships and synthesize updated graph entity edges.',
      triggerType: 'event',
      triggerConfig: { eventName: 'MEMORY_CREATED' },
      actionType: 'synthesize_graph',
      actionConfig: {},
      status: 'active'
    });

    this.createAutomation({
      workspaceId,
      name: 'Daily Research Digest',
      description: 'Every morning, search for new papers and updates on AI deployment and summarize key insights.',
      triggerType: 'schedule',
      triggerConfig: { frequency: 'daily', timeOfDay: '09:00' },
      actionType: 'agent_task',
      actionConfig: { prompt: 'Perform a research search on latest AI operating system breakthroughs and summarize key developments.' },
      status: 'paused'
    });
  }


  // ── User Management (Auth Hardening) ──

  createUser(username: string, email: string, passwordHash: string): string {
    const id = uuidv4();
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
    const id = uuidv4();
    const token = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
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

    const deviceId = uuidv4();
    const insertDevice = this.db.prepare('INSERT INTO companion_devices (id, name, fingerprint, scope) VALUES (?, ?, ?, ?)');
    try {
      insertDevice.run(deviceId, deviceName, fingerprint, row.scope);
    } catch (e: any) {
      const existing = this.db.prepare('SELECT id FROM companion_devices WHERE fingerprint = ?').get(fingerprint) as any;
      if (existing) return existing.id;
      return null;
    }

    const update = this.db.prepare('UPDATE companion_tokens SET claimedByDeviceId = ? WHERE id = ?');
    update.run(deviceId, row.id);
    return deviceId;
  }

  createDeviceSession(deviceId: string, expiryHours: number = 24): string | null {
    const device = this.db.prepare('SELECT * FROM companion_devices WHERE id = ? AND revoked = 0').get(deviceId) as any;
    if (!device) return null;

    const sessionToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
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
