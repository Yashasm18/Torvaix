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

export class MemoryStore {
  private db: Database.Database;
  private qdrant: QdrantClient;
  private collectionName = 'torvaix_memories';
  private embedModel = 'nomic-embed-text';
  private ollamaUrl = 'http://localhost:11434';

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
    `);
    
    // Attempt to alter table if the columns don't exist (for existing dev databases)
    try {
      this.db.exec(`ALTER TABLE memories ADD COLUMN lastAccessedAt DATETIME DEFAULT CURRENT_TIMESTAMP;`);
    } catch (e) { /* Column might already exist */ }
    try {
      this.db.exec(`ALTER TABLE memories ADD COLUMN retrievalCount INTEGER DEFAULT 0;`);
    } catch (e) { /* Column might already exist */ }
  }

  public async initQdrant() {
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
    } catch (e) {
      console.error(`[MemoryStore] Failed to init Qdrant:`, e);
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.embedModel,
        prompt: text
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to generate embedding: ${response.statusText}`);
    }
    const data = await response.json() as any;
    return data.embedding;
  }

  public async storeMemory(workspaceId: string, content: string, source: string): Promise<string> {
    const id = uuidv4();
    
    // 1. Generate Embedding
    const vector = await this.generateEmbedding(content);

    // 2. Store in Qdrant
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

    // 3. Store in SQLite
    const stmt = this.db.prepare('INSERT INTO memories (id, workspaceId, source, content) VALUES (?, ?, ?, ?)');
    stmt.run(id, workspaceId, source, content);

    // 4. Emit Event
    torvaixEvents.emitMemoryCreated({ id, workspaceId, source, content });

    return id;
  }

  public async queryMemory(workspaceId: string, query: string, topK: number = 5): Promise<MemoryQueryResult[]> {
    const vector = await this.generateEmbedding(query);

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
        // Update access stats
        updateStatsStmt.run(point.id);

        results.push({
          id: String(point.id),
          content: row.content,
          source: String(point.payload?.source || 'unknown'),
          score: point.score,
        });
      }
    }

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
    const vector = await this.generateEmbedding(newContent);
    
    const stmt = this.db.prepare('SELECT workspaceId, source FROM memories WHERE id = ?');
    const row = stmt.get(id) as { workspaceId: string, source: string };
    
    if (!row) {
      throw new Error(`Memory with ID ${id} not found`);
    }

    // Update Qdrant
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

    // Update SQLite
    const updateStmt = this.db.prepare('UPDATE memories SET content = ? WHERE id = ?');
    updateStmt.run(newContent, id);

    // Emit Event
    torvaixEvents.emitMemoryUpdated({ id, newContent });
  }

  public async deleteMemory(id: string): Promise<void> {
    // Delete from Qdrant
    await this.qdrant.delete(this.collectionName, {
      wait: true,
      points: [id]
    });

    // Delete from SQLite
    const stmt = this.db.prepare('DELETE FROM memories WHERE id = ?');
    stmt.run(id);

    // Emit Event
    torvaixEvents.emitMemoryDeleted({ id });
  }
}
