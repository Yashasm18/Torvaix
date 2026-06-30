# Torvaix Production Audit (PROD_AUDIT.md)
**Self-Debugging & Bottleneck Analysis**

As part of the final push for V1, an internal audit was conducted across the Torvaix Monorepo to identify production bottlenecks, security concerns, and scaling limitations.

## 1. Concurrency & Agent State 
**Bottleneck:** The `/api/agent/run` route uses an in-memory `Map` to store active agent traces and states. 
* **Impact:** This restricts Torvaix to a single Node.js process. If the server is restarted, all currently streaming UI connections and trace states are orphaned.
* **Fix Required:** Migrate agent state tracking to Redis or the SQLite metadata database to allow multi-process clustering.

## 2. SQLite Database Locking
**Bottleneck:** SQLite handles concurrent reads beautifully via WAL mode, but concurrent writes lock the entire database.
* **Impact:** As Torvaix introduces "Background Autonomous Agents" (Phase 3 Roadmap) that constantly scrape files and write to memory, user-initiated chats might encounter `SQLITE_BUSY` timeouts.
* **Fix Required:** Implement a centralized write-queue (e.g., using BullMQ) so background agents and the user interface do not compete for file locks.

## 3. Tool Sandboxing (Security)
**Bottleneck:** The MCP `bash` and `python` tools execute directly on the host machine using `child_process.exec`. 
* **Impact:** While acceptable for a trusted local environment, any prompt injection attack (e.g., summarizing a malicious webpage) could result in the agent executing arbitrary `rm -rf` commands on the host.
* **Fix Required:** Route execution tools through a lightweight Docker container (e.g., `torvaix-sandbox`) with heavily restricted volume mounts.

## 4. MCP Rate Limiting & Error Bubbling
**Bottleneck:** The `web_search` MCP tool calls DuckDuckGo's API directly without caching.
* **Impact:** Repeated identical queries will rate-limit the user's IP. Furthermore, unhandled API timeouts can stall the agent's LLM completion cycle indefinitely.
* **Fix Required:** Implement a localized caching layer (TTL: 24hrs) for identical web searches. (Partially mitigated by recent timeout patches).

## 5. Next.js Hot Reloading
**Bottleneck:** Next.js and the custom Agent Server (`server.ts`) run on different ports (3000 vs 3001) but share a workspace.
* **Impact:** Developers must manually orchestrate the backend server restarts.
* **Fix Required:** Migrate the Agent Server into Next.js Custom Server or build a unified `concurrently` script in the root `package.json`.
