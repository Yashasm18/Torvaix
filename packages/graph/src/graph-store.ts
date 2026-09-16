import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Resolve to $TORVAIX_HOME/graph.db (default ~/.torvaix), the same home the memory store uses.
const torvaixDir = process.env.TORVAIX_HOME || path.join(os.homedir(), '.torvaix');
if (!fs.existsSync(torvaixDir)) {
  fs.mkdirSync(torvaixDir, { recursive: true });
}

const dbPath = path.join(torvaixDir, 'graph.db');
export const db = new Database(dbPath);

// Initialize schema with WAL mode
db.pragma('journal_mode = WAL');

/** Workspace used when a caller doesn't specify one (matches the memory store's default). */
export const DEFAULT_GRAPH_WORKSPACE = 'default';

// Entities and relationships belong to a workspace: the same name can mean different things in
// two workspaces, and one workspace's graph must never leak into another's context.
const NODES_SCHEMA = `
  CREATE TABLE IF NOT EXISTS nodes (
    id TEXT NOT NULL,
    workspaceId TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    importance REAL DEFAULT 5.0,
    degree INTEGER DEFAULT 0,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (workspaceId, id)
  );
`;

const EDGES_SCHEMA = `
  CREATE TABLE IF NOT EXISTS edges (
    id TEXT NOT NULL,
    workspaceId TEXT NOT NULL DEFAULT 'default',
    source_id TEXT NOT NULL,
    relation TEXT NOT NULL,
    target_id TEXT NOT NULL,
    confidence REAL DEFAULT 1.0,
    frequency INTEGER DEFAULT 1,
    PRIMARY KEY (workspaceId, id),
    UNIQUE (workspaceId, source_id, relation, target_id)
  );
`;

function tableExists(name: string): boolean {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}

function hasColumn(table: string, column: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(c => c.name === column);
}

db.exec(NODES_SCHEMA);
db.exec(EDGES_SCHEMA);

// Idempotent column additions for backward compatibility
try {
  if (!hasColumn('nodes', 'degree')) {
    db.exec('ALTER TABLE nodes ADD COLUMN degree INTEGER DEFAULT 0');
  }
  if (!hasColumn('edges', 'frequency')) {
    db.exec('ALTER TABLE edges ADD COLUMN frequency INTEGER DEFAULT 1');
  }
} catch {
  // Ignore migration errors if columns already exist
}

// Graphs written before workspace scoping were global; adopt those rows into the default
// workspace rather than dropping them.
try {
  // SQLite table rebuild: better-sqlite3 enables foreign keys, and the legacy `edges` table
  // references `nodes`, so renaming/dropping mid-migration would trip the constraint. Both
  // pragmas are no-ops inside a transaction, so they wrap it.
  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');

  const migrate = db.transaction(() => {
    if (tableExists('nodes') && !hasColumn('nodes', 'workspaceId')) {
      db.exec('ALTER TABLE nodes RENAME TO nodes_pre_workspace');
      db.exec(NODES_SCHEMA);
      db.exec(`
        INSERT OR IGNORE INTO nodes (id, workspaceId, name, type, importance, degree, metadata, created_at)
        SELECT id, '${DEFAULT_GRAPH_WORKSPACE}', name, type, importance, COALESCE(degree, 0), metadata, created_at
        FROM nodes_pre_workspace
      `);
      db.exec('DROP TABLE nodes_pre_workspace');
    }

    if (tableExists('edges') && !hasColumn('edges', 'workspaceId')) {
      db.exec('ALTER TABLE edges RENAME TO edges_pre_workspace');
      db.exec(EDGES_SCHEMA);
      db.exec(`
        INSERT OR IGNORE INTO edges (id, workspaceId, source_id, relation, target_id, confidence, frequency)
        SELECT id, '${DEFAULT_GRAPH_WORKSPACE}', source_id, relation, target_id, confidence, COALESCE(frequency, 1)
        FROM edges_pre_workspace
      `);
      db.exec('DROP TABLE edges_pre_workspace');
    }
  });
  migrate();
} catch (e) {
  console.warn('[Graph] Workspace migration skipped:', e);
} finally {
  db.pragma('legacy_alter_table = OFF');
  db.pragma('foreign_keys = ON');
}

// Performance indexes (workspace first: every query filters by it)
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_nodes_workspace_type ON nodes(workspaceId, type);
  CREATE INDEX IF NOT EXISTS idx_nodes_workspace_name ON nodes(workspaceId, name);
  CREATE INDEX IF NOT EXISTS idx_nodes_workspace_importance ON nodes(workspaceId, importance DESC);
  CREATE INDEX IF NOT EXISTS idx_edges_workspace_source ON edges(workspaceId, source_id);
  CREATE INDEX IF NOT EXISTS idx_edges_workspace_target ON edges(workspaceId, target_id);
  CREATE INDEX IF NOT EXISTS idx_edges_workspace_relation ON edges(workspaceId, relation);
`);
