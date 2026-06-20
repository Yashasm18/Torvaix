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

export class MemoryStore {
  private db: Database.Database;
  private qdrant: QdrantClient;
  private qdrantAvailable = false;
  private qdrantChecked = false;
  private collectionName = 'torvaix_memories';
  private embedModel = 'nomic-embed-text';
  private ollamaUrl = 'http://localhost:11434';
  private ollamaAvailable = false;
  private ollamaChecked = false;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.qdrant = new QdrantClient({ url: 'http://localhost:6333' });
    this.initSQLite();
  }

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

  public async initQdrant() {
    if (this.qdrantChecked) return this.qdrantAvailable;
    this.qdrantChecked = true;

    try {
      const result = await this.qdrant.getCollections();
      const exists = result.collections.some(c => c.name === this.collectionName);
      if (!exists) {
        await this.qdrant.createCollection(this.collectionName, {
          vectors: {
            size: 768, // nomic-embed-text generates 768-dimensional vectors
            distance: 'Cosine',
          },
        });
        console.log(`[MemoryStore] Created Qdrant collection: ${this.collectionName}`);
      }
      this.qdrantAvailable = true;
      console.log('[MemoryStore] Qdrant connected successfully');
    } catch (e) {
      this.qdrantAvailable = false;
      console.warn('[MemoryStore] Qdrant unavailable — falling back to SQLite-only mode');
    }

    return this.qdrantAvailable;
  }

  private async checkOllama(): Promise<boolean> {
    if (this.ollamaChecked) return this.ollamaAvailable;
    this.ollamaChecked = true;

    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      if (response.ok) {
        this.ollamaAvailable = true;
        console.log('[MemoryStore] Ollama connected successfully');
      }
    } catch (e) {
      this.ollamaAvailable = false;
      console.warn('[MemoryStore] Ollama unavailable — vector embeddings disabled');
    }
    return this.ollamaAvailable;
  }

  private async generateEmbedding(text: string): Promise<number[] | null> {
    const ollamaOk = await this.checkOllama();
    if (!ollamaOk) return null;

    try {
      const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embedModel,
          prompt: text
        }),
      });
      if (!response.ok) {
        console.warn(`[MemoryStore] Embedding generation failed: ${response.statusText}`);
        return null;
      }
      const data = await response.json() as any;
      return data.embedding;
    } catch (e) {
      console.warn('[MemoryStore] Embedding generation failed:', e);
      return null;
    }
  }

  public async storeMemory(workspaceId: string, content: string, source: string): Promise<string> {
    const id = uuidv4();
    
    // 1. Try to store vector in Qdrant (if available)
    await this.initQdrant();
    if (this.qdrantAvailable) {
      const vector = await this.generateEmbedding(content);
      if (vector) {
        try {
          await this.qdrant.upsert(this.collectionName, {
            wait: true,
            points: [
              {
                id,
                vector,
                payload: { workspaceId, source }
              }
            ]
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

  public async queryMemory(workspaceId: string, query: string, topK: number = 5): Promise<MemoryQueryResult[]> {
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
              must: [
                {
                  key: 'workspaceId',
                  match: {
                    value: workspaceId
                  }
                }
              ]
            }
          });

          const results: MemoryQueryResult[] = [];
          const stmt = this.db.prepare('SELECT content FROM memories WHERE id = ?');
          const updateStatsStmt = this.db.prepare('UPDATE memories SET lastAccessedAt = CURRENT_TIMESTAMP, retrievalCount = retrievalCount + 1 WHERE id = ?');

          for (const point of searchResults) {
            const row = stmt.get(point.id) as { content: string };
            if (row) {
              updateStatsStmt.run(point.id);
              results.push({
                id: String(point.id),
                content: row.content,
                source: String(point.payload?.source || 'unknown'),
                score: point.score,
              });
            }
          }

          console.log(`[MemoryStore] Vector query returned ${results.length} results`);
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
      // Return most recent memories
      const stmt = this.db.prepare('SELECT id, content, source FROM memories WHERE workspaceId = ? ORDER BY createdAt DESC LIMIT ?');
      const rows = stmt.all(workspaceId, topK) as { id: string; content: string; source: string }[];
      return rows.map(r => ({ ...r, score: 0.5 }));
    }

    // Build a LIKE query for each keyword
    const conditions = keywords.map(() => `LOWER(content) LIKE ?`).join(' OR ');
    const params = keywords.map(k => `%${k}%`);
    
    const stmt = this.db.prepare(
      `SELECT id, content, source FROM memories WHERE workspaceId = ? AND (${conditions}) ORDER BY createdAt DESC LIMIT ?`
    );
    const rows = stmt.all(workspaceId, ...params, topK) as { id: string; content: string; source: string }[];

    // Compute a naive keyword-match score
    const results: MemoryQueryResult[] = rows.map(row => {
      const lowerContent = row.content.toLowerCase();
      const matchCount = keywords.filter(k => lowerContent.includes(k)).length;
      return {
        id: row.id,
        content: row.content,
        source: row.source,
        score: matchCount / keywords.length, // 0.0 to 1.0
      };
    });

    // Update access stats
    const updateStatsStmt = this.db.prepare('UPDATE memories SET lastAccessedAt = CURRENT_TIMESTAMP, retrievalCount = retrievalCount + 1 WHERE id = ?');
    for (const r of results) {
      updateStatsStmt.run(r.id);
    }

    console.log(`[MemoryStore] SQLite keyword query returned ${results.length} results`);
    return results;
  }

  public async getAllMemories(workspaceId: string) {
    const stmt = this.db.prepare('SELECT * FROM memories WHERE workspaceId = ? ORDER BY createdAt DESC');
    return stmt.all(workspaceId);
  }

  public async getMemoryById(id: string) {
    const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
    return stmt.get(id);
  }

  public async updateMemory(id: string, newContent: string): Promise<void> {
    const stmt = this.db.prepare('SELECT workspaceId, source FROM memories WHERE id = ?');
    const row = stmt.get(id) as { workspaceId: string, source: string };
    
    if (!row) {
      throw new Error(`Memory with ID ${id} not found`);
    }

    // Update Qdrant if available
    await this.initQdrant();
    if (this.qdrantAvailable) {
      const vector = await this.generateEmbedding(newContent);
      if (vector) {
        try {
          await this.qdrant.upsert(this.collectionName, {
            wait: true,
            points: [
              {
                id,
                vector,
                payload: { workspaceId: row.workspaceId, source: row.source }
              }
            ]
          });
        } catch (e) {
          console.warn('[MemoryStore] Qdrant update failed:', e);
        }
      }
    }

    // Update SQLite
    const updateStmt = this.db.prepare('UPDATE memories SET content = ? WHERE id = ?');
    updateStmt.run(newContent, id);

    // Emit Event
    torvaixEvents.emitMemoryUpdated({ id, newContent });
  }

  public async deleteMemory(id: string): Promise<void> {
    // Delete from Qdrant if available
    await this.initQdrant();
    if (this.qdrantAvailable) {
      try {
        await this.qdrant.delete(this.collectionName, {
          wait: true,
          points: [id]
        });
      } catch (e) {
        console.warn('[MemoryStore] Qdrant delete failed:', e);
      }
    }

    // Delete from SQLite
    const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?');
    stmt.run(id);

    // Emit Event
    torvaixEvents.emitMemoryDeleted({ id });
  }

  // --- Workspace Methods ---
  public createWorkspace(name: string, settings: any = {}): string {
    const id = uuidv4();
    const stmt = this.db.prepare('INSERT INTO workspaces (id, name, settings) VALUES (?, ?, ?)');
    stmt.run(id, name, JSON.stringify(settings));
    return id;
  }

  public getWorkspace(id: string): Workspace | undefined {
    const stmt = this.db.prepare('SELECT * FROM workspaces WHERE id = ?');
    return stmt.get(id) as Workspace | undefined;
  }

  public listWorkspaces(): Workspace[] {
    const stmt = this.db.prepare('SELECT * FROM workspaces ORDER BY createdAt DESC');
    return stmt.all() as Workspace[];
  }

  // --- Conversation Methods ---
  public createConversation(workspaceId: string, title: string): string {
    const id = uuidv4();
    const stmt = this.db.prepare('INSERT INTO conversations (id, workspaceId, title) VALUES (?, ?, ?)');
    stmt.run(id, workspaceId, title);
    return id;
  }

  public listConversations(workspaceId: string): Conversation[] {
    const stmt = this.db.prepare('SELECT * FROM conversations WHERE workspaceId = ? ORDER BY createdAt DESC');
    return stmt.all(workspaceId) as Conversation[];
  }

  // --- Pending Actions (Security) ---
  public createPendingAction(workspaceId: string, action: string, params: any): string {
    const id = uuidv4();
    const stmt = this.db.prepare('INSERT INTO pending_actions (id, workspaceId, action, params) VALUES (?, ?, ?, ?)');
    stmt.run(id, workspaceId, action, JSON.stringify(params));
    return id;
  }

  public getPendingAction(id: string): PendingAction | undefined {
    const stmt = this.db.prepare('SELECT * FROM pending_actions WHERE id = ?');
    return stmt.get(id) as PendingAction | undefined;
  }

  public updatePendingActionStatus(id: string, status: 'approved' | 'rejected') {
    const stmt = this.db.prepare('UPDATE pending_actions SET status = ? WHERE id = ?');
    stmt.run(status, id);
  }

  // --- Execution Logs ---
  public logExecution(workspaceId: string, action: string, params: any, result: any, status: string) {
    const id = uuidv4();
    const stmt = this.db.prepare('INSERT INTO execution_logs (id, workspaceId, action, params, result, status) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(id, workspaceId, action, JSON.stringify(params), JSON.stringify(result), status);
    return id;
  }

  // --- Companion Layer (Experimental) ---

  /** Create a one-time pairing token with an expiry and scope. */
  public createPairingToken(scope: 'readonly' | 'admin' = 'readonly', expiryMinutes: number = 10): { id: string, token: string } {
    const id = uuidv4();
    const token = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
    const stmt = this.db.prepare('INSERT INTO companion_tokens (id, token, scope, expiresAt) VALUES (?, ?, ?, ?)');
    stmt.run(id, token, scope, expiresAt);
    return { id, token };
  }

  /** Claim a pairing token — registers a new trusted device. Returns device ID or null. */
  public claimPairingToken(token: string, deviceName: string, fingerprint: string): string | null {
    const stmt = this.db.prepare('SELECT * FROM companion_tokens WHERE token = ? AND revoked = 0');
    const row = stmt.get(token) as any;
    if (!row) return null;
    if (new Date(row.expiresAt) < new Date()) return null; // expired
    if (row.claimedByDeviceId) return null; // already claimed

    // Create the trusted device
    const deviceId = uuidv4();
    const insertDevice = this.db.prepare('INSERT INTO companion_devices (id, name, fingerprint, scope) VALUES (?, ?, ?, ?)');
    try {
      insertDevice.run(deviceId, deviceName, fingerprint, row.scope);
    } catch (e: any) {
      // fingerprint already registered (unique constraint)
      const existing = this.db.prepare('SELECT id FROM companion_devices WHERE fingerprint = ?').get(fingerprint) as any;
      if (existing) return existing.id;
      return null;
    }

    // Mark token as claimed
    const update = this.db.prepare('UPDATE companion_tokens SET claimedByDeviceId = ? WHERE id = ?');
    update.run(deviceId, row.id);

    return deviceId;
  }

  /** Create a session for a trusted device. Returns session token. */
  public createDeviceSession(deviceId: string, expiryHours: number = 24): string | null {
    const device = this.db.prepare('SELECT * FROM companion_devices WHERE id = ? AND revoked = 0').get(deviceId) as any;
    if (!device) return null;

    const sessionToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
    const sessionExpiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

    const stmt = this.db.prepare('UPDATE companion_devices SET sessionToken = ?, sessionExpiresAt = ?, lastSeenAt = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(sessionToken, sessionExpiresAt, deviceId);

    return sessionToken;
  }

  /** Validate a session token. Returns device info or null. */
  public validateSession(sessionToken: string): { deviceId: string, scope: string, name: string } | null {
    const stmt = this.db.prepare('SELECT * FROM companion_devices WHERE sessionToken = ? AND revoked = 0');
    const device = stmt.get(sessionToken) as any;
    if (!device) return null;
    if (new Date(device.sessionExpiresAt) < new Date()) return null;

    // Touch lastSeenAt
    this.db.prepare('UPDATE companion_devices SET lastSeenAt = CURRENT_TIMESTAMP WHERE id = ?').run(device.id);
    return { deviceId: device.id, scope: device.scope, name: device.name };
  }

  /** Revoke a trusted device. */
  public revokeDevice(deviceId: string) {
    this.db.prepare('UPDATE companion_devices SET revoked = 1, sessionToken = NULL WHERE id = ?').run(deviceId);
  }

  /** List all companion devices. */
  public listCompanionDevices(): any[] {
    return this.db.prepare('SELECT id, name, fingerprint, scope, lastSeenAt, revoked, createdAt FROM companion_devices ORDER BY createdAt DESC').all();
  }
}
