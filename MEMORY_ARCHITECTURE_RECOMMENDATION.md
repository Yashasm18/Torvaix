# Long-Term Memory Architecture for AI Operating Systems
**Recommendation Report for Torvaix V2**

## Executive Summary
This document analyzes the optimal vector database backend for Torvaix's evolution from a local-first conversational interface into a persistent, autonomous AI operating system. We compare three distinct architectures: **Qdrant**, **pgvector**, and **SQLite FTS / sqlite-vss**.

**Recommendation**: We recommend a **hybrid architecture** combining **SQLite (for metadata and local caching)** with **Qdrant (for scalable, high-performance semantic retrieval)**. 

---

## 1. Qdrant (The Vector-Native Engine)
Qdrant is a Rust-based vector search engine designed specifically for semantic search.

* **Pros:**
  * Blazing fast Approximate Nearest Neighbor (HNSW) search.
  * Rich payload filtering capabilities (hybrid search).
  * Built-in vector storage optimization.
  * Scales exceptionally well across millions of memories.
* **Cons:**
  * Requires a separate service/container (heavy for purely local edge instances).
  * Not a relational database (complex data relationships require external mapping).

## 2. pgvector (The Relational Workhorse)
An extension for PostgreSQL that allows storing and querying vector embeddings within a traditional RDBMS.

* **Pros:**
  * ACID compliant; links vectors directly to users, workspaces, and complex metadata.
  * Mature ecosystem (backups, replication, row-level security).
* **Cons:**
  * Significant overhead for local-first setups (requires Postgres daemon).
  * HNSW indexing is slower to build than native vector databases like Qdrant.

## 3. SQLite + FTS / sqlite-vss (The Edge-Native Minimalist)
SQLite is an embedded database. `sqlite-vss` adds vector similarity search capabilities.

* **Pros:**
  * Zero configuration. Runs purely in-process. Perfect for single-user local instances.
  * Easy to bundle and distribute.
  * FTS5 handles exact keyword fallback beautifully.
* **Cons:**
  * `sqlite-vss` is experimental and lacks the maturity/performance of Qdrant on large datasets.
  * Concurrency issues (write-locks) if multiple autonomous background agents try to index memory simultaneously.

---

## Final Architecture Decision: The Torvaix Hybrid Model

Given Torvaix's need for **local-first privacy** but **multi-agent concurrency**, we will adopt a dual-engine architecture:

1. **SQLite (The Truth Layer)**: All raw conversation logs, task outputs, and application state are stored in SQLite. This ensures Torvaix can run offline on a laptop with zero dependencies.
2. **Qdrant (The Semantic Index)**: For users with Docker enabled or those connecting to a Torvaix Cloud relay, Qdrant serves as the high-speed retrieval engine. 

When Qdrant is unavailable, Torvaix gracefully degrades to **SQLite FTS** keyword search—ensuring the user never loses access to their memory.
