const { MemoryStore } = require('./packages/memory/dist/index.js');
const path = require('path');
const store = new MemoryStore(path.join(process.cwd(), 'torvaix_metadata.db'));
store.db.exec("INSERT OR IGNORE INTO workspaces (id, name, settings) VALUES ('test-workspace', 'Test', '{}')");
console.log("Workspace created.");
