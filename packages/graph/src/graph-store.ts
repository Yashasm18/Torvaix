import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Resolve to ~/.torvaix/graph.db
const torvaixDir = path.join(os.homedir(), '.torvaix');
if (!fs.existsSync(torvaixDir)) {
  fs.mkdirSync(torvaixDir, { recursive: true });
}

const dbPath = path.join(torvaixDir, 'graph.db');
export const db = new Database(dbPath);

// Initialize schema with WAL mode
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    importance REAL DEFAULT 5.0,
    degree INTEGER DEFAULT 0,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    relation TEXT NOT NULL,
    target_id TEXT NOT NULL,
    confidence REAL DEFAULT 1.0,
    frequency INTEGER DEFAULT 1,
    FOREIGN KEY(source_id) REFERENCES nodes(id),
    FOREIGN KEY(target_id) REFERENCES nodes(id),
    UNIQUE(source_id, relation, target_id)
  );
`);

// Idempotent column additions for backward compatibility
try {
  const nodeCols = db.prepare("PRAGMA table_info(nodes)").all() as any[];
  if (!nodeCols.some(c => c.name === 'degree')) {
    db.exec("ALTER TABLE nodes ADD COLUMN degree INTEGER DEFAULT 0");
  }

  const edgeCols = db.prepare("PRAGMA table_info(edges)").all() as any[];
  if (!edgeCols.some(c => c.name === 'frequency')) {
    db.exec("ALTER TABLE edges ADD COLUMN frequency INTEGER DEFAULT 1");
  }
} catch {
  // Ignore migration errors if columns already exist
}

// Performance indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
  CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
  CREATE INDEX IF NOT EXISTS idx_nodes_importance ON nodes(importance DESC);
  CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
  CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
  CREATE INDEX IF NOT EXISTS idx_edges_relation ON edges(relation);
`);
