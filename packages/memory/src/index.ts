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
    `);
    
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

  async queryMemory(workspaceId: string, query: string, topK: number = 5): Promise<MemoryQueryResult[]> {
    await this.initQdrant();

    // If Qdrant + embeddings are available, use vector search
    if (this.qdrantAvailable) {
      const vector = await this.generateEmbedding(query);
      if (vector) {
        try {
          const searchResults = await this.qdrant.search(this.collectionName, {
            vector,
            limit: topK,
            filter: {
              must: [{ key: 'workspaceId', match: { value: workspaceId } }],
            },
          });

          const results: MemoryQueryResult[] = [];
          const stmt = this.db.prepare('SELECT content FROM memories WHERE id = ?');
          const updateStatsStmt = this.db.prepare('UPDATE memories SET lastAccessedAt = CURRENT_TIMESTAMP, retrievalCount = retrievalCount + 1 WHERE id = ?');

          for (const point of searchResults) {
            const row = stmt.get(point.id) as { content: string } | undefined;
            if (row) {
              updateStatsStmt.run(point.id);
              results.push({
                id: String(point.id),
                content: row.content,
                source: String(point.payload?.source ?? 'unknown'),
                score: point.score,
              });
            }
          }

          console.log(`[MemoryStore] Vector query returned ${results.length} results (source: ${this.embedSource})`);
          return results;
        } catch (e) {
          console.warn('[MemoryStore] Qdrant search failed, falling back to SQLite:', e);
        }
      }
    }

    // FALLBACK: SQLite keyword search using LIKE
    console.log('[MemoryStore] Using SQLite keyword fallback for memory query');
    const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    if (keywords.length === 0) {
      const stmt = this.db.prepare('SELECT id, content, source FROM memories WHERE workspaceId = ? ORDER BY createdAt DESC LIMIT ?');
      const rows = stmt.all(workspaceId, topK) as { id: string; content: string; source: string }[];
      return rows.map(r => ({ ...r, score: 0.5 }));
    }

    const conditions = keywords.map(() => 'LOWER(content) LIKE ?').join(' OR ');
    const params = keywords.map(k => `%${k}%`);
    
    const stmt = this.db.prepare(
      `SELECT id, content, source FROM memories WHERE workspaceId = ? AND (${conditions}) ORDER BY createdAt DESC LIMIT ?`
    );
    const rows = stmt.all(workspaceId, ...params, topK) as { id: string; content: string; source: string }[];

    const results: MemoryQueryResult[] = rows.map(row => {
      const lowerContent = row.content.toLowerCase();
      const matchCount = keywords.filter(k => lowerContent.includes(k)).length;
      return {
        id: row.id,
        content: row.content,
        source: row.source,
        score: matchCount / keywords.length,
      };
    });

    const updateStatsStmt = this.db.prepare('UPDATE memories SET lastAccessedAt = CURRENT_TIMESTAMP, retrievalCount = retrievalCount + 1 WHERE id = ?');
    for (const r of results) {
      updateStatsStmt.run(r.id);
    }

    console.log(`[MemoryStore] SQLite keyword query returned ${results.length} results`);
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

  // ── Execution Logs ──

  logExecution(workspaceId: string, action: string, params: any, result: any, status: string) {
    const id = uuidv4();
    const stmt = this.db.prepare('INSERT INTO execution_logs (id, workspaceId, action, params, result, status) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(id, workspaceId, action, JSON.stringify(params), JSON.stringify(result), status);
    return id;
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
