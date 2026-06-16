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

// Initialize schema
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    importance REAL DEFAULT 5.0,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    relation TEXT NOT NULL,
    target_id TEXT NOT NULL,
    confidence REAL DEFAULT 1.0,
    FOREIGN KEY(source_id) REFERENCES nodes(id),
    FOREIGN KEY(target_id) REFERENCES nodes(id),
    UNIQUE(source_id, relation, target_id)
  );
`);
