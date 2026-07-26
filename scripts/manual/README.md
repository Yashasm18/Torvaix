# Manual verification scripts

These scripts are retained for local, manual verification and are not part of the automated test suite.

- `create-workspace.js` creates a local test workspace in the SQLite memory store.
- `test-agent-loop.js` exercises the agent loop against a local Ollama endpoint.
- `test-memory.js` checks memory storage and retrieval through the running web API.

Run the automated suite with `npm test` instead.
