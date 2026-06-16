# TORVAIX

**An AI Knowledge Operating System that remembers, connects, and grows with your work.**

[Live website](https://Yashasm18.github.io/Torvaix) · [Repository](https://github.com/Yashasm18/Torvaix)

TORVAIX is not trying to be another chatbot.

It is a local-first AI workspace where conversations, tasks, documents, research, projects, and decisions become persistent knowledge. Every useful interaction can become memory. Every memory can become structured knowledge. Every knowledge item can be connected through relationships. Over time, TORVAIX should become a living intelligence layer over what you know, build, and learn.

```text
User input
   |
   v
Memory retrieval
   |
   v
Knowledge extraction
   |
   v
Graph relationships
   |
   v
Context-aware reasoning
   |
   v
New durable knowledge
```

## Core Idea

Most AI products focus on chat, agents, automation, and model access.

TORVAIX focuses on:

- **Memory**: conversations and important facts persist beyond one chat.
- **Knowledge**: raw memories become categorized, tagged, and scored.
- **Context**: relevant memories are automatically injected into prompts.
- **Relationships**: entities become graph nodes, and connections become graph edges.
- **Reasoning**: the assistant can inspect memory and graph context before answering.
- **Local ownership**: the system is designed around local services and user control.

The goal is simple but ambitious:

> Build an AI system that does not merely answer. It remembers, understands, and compounds.

## What Exists Now

| Area | Status | What it does |
| --- | --- | --- |
| Workspace UI | Implemented | Next.js workspace shell, navigation, dashboard, chat, graph route, command palette, right context panel patterns. |
| Agent Chat | Implemented | Chat endpoint with model provider selection, tool calling, local tools, memory tools, and graph tools. |
| Persistent Memory | Implemented | Stores memories with SQLite metadata and Qdrant vector search. |
| Embeddings | Implemented | Uses Ollama with `nomic-embed-text` for local embeddings. |
| Python Intelligence Layer | Implemented | FastAPI service that categorizes memories, extracts entities, generates tags, scores importance, and detects relationships. |
| Knowledge Graph | Implemented | SQLite graph database at `~/.torvaix/graph.db` with nodes, edges, traversal, search, and path finding. |
| Graph UI | Implemented | `/app/graph` renders an interactive graph using `react-force-graph-2d`. |
| Graph-Aware Chat | Implemented | Chat can use `query_graph`, `get_neighbors`, `find_path`, and `find_entities_by_type`. |
| Optional WebSocket Backend | Experimental | Express/WebSocket server for self-hosted conversations and real-time message flows. |
| Intelligence Routing | Scaffolded | `packages/intelligence` exists as the next major package for routing, model selection, cost tracking, and fallback logic. |

## System Architecture

```text
                              TORVAIX
                                 |
        -----------------------------------------------------
        |                       |                           |
     apps/web              packages/*                 services/*
        |                       |                           |
   Next.js UI        Memory / Agent / Graph          Python FastAPI
        |                       |                           |
        |                       |                           |
   Chat + Graph UI       Tool + Knowledge APIs      ML intelligence layer
        |                       |                           |
        ------------------------|----------------------------
                                 |
                         Local knowledge core
                                 |
               -----------------------------------
               |                |                |
            SQLite           Qdrant           Ollama
          metadata       vector search      embeddings
               |
        ~/.torvaix/graph.db
```

## Knowledge Flow

When a useful fact or project detail is stored, TORVAIX runs a full knowledge pipeline:

```text
store_memory
   |
   |-- generate embedding with Ollama
   |-- save vector in Qdrant
   |-- save metadata in SQLite
   |-- send text to Python intelligence layer
   |-- extract category, entities, tags, importance, relationships
   |-- ingest entities into graph nodes
   |-- ingest relationships into graph edges
   |
   v
queryable long-term knowledge
```

Example intelligence payload:

```json
{
  "category": "Project",
  "importance": 8.5,
  "entities": [
    { "text": "TORVAIX", "type": "ORG" },
    { "text": "Qdrant", "type": "PRODUCT" }
  ],
  "tags": ["memory", "graph", "workspace"],
  "relationships": [
    {
      "source": "TORVAIX",
      "relation": "uses",
      "target": "Qdrant",
      "confidence": 0.9
    }
  ]
}
```

## Agent Tools

TORVAIX chat and agent loops expose tools for local work and knowledge reasoning.

| Tool | Purpose |
| --- | --- |
| `bash` | Run local shell commands. |
| `read_file` | Read local files. |
| `python` | Execute Python snippets. |
| `web_search` | Search the web through DuckDuckGo instant answers. |
| `store_memory` | Save durable memory into the local memory system. |
| `query_memory` | Retrieve relevant memories semantically. |
| `update_memory` | Correct or revise stored memories. |
| `delete_memory` | Remove stale or incorrect memories. |
| `query_graph` | Search entities in the local knowledge graph. |
| `get_neighbors` | Inspect directly connected graph entities. |
| `find_path` | Find a relationship path between two entities. |
| `find_entities_by_type` | List entities by type, such as project, task, person, or technology. |

This is the key difference: TORVAIX does not only call tools to execute tasks. It uses tools to maintain a long-term knowledge system.

## Repository Structure

```text
TORVAIX/
├── apps/
│   └── web/
│       ├── src/app/(marketing)/      # Public landing page
│       ├── src/app/(workspace)/      # Workspace UI routes
│       ├── src/app/api/chat/         # Graph-aware chat API
│       ├── src/app/api/graph/        # Graph data API
│       └── src/components/           # App shell, chat, UI, settings
├── packages/
│   ├── agent/                        # Agent loop and local tool execution
│   ├── events/                       # Internal event bus
│   ├── graph/                        # SQLite graph store, ingestion, queries
│   ├── intelligence/                 # Future routing package
│   ├── memory/                       # Qdrant + SQLite memory store
│   ├── providers/                    # Provider definitions
│   ├── router/                       # Routing helpers
│   └── types/                        # Shared TypeScript types
├── services/
│   └── python-agent/                 # FastAPI intelligence layer
├── scripts/
│   └── test-graph.ts                 # Graph test script
├── docker-compose.yml                # Qdrant service
└── package.json                      # npm workspace root
```

## Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| UI | shadcn-style components, Lucide icons, Framer Motion |
| Chat | Vercel AI SDK, OpenAI-compatible Ollama endpoint, provider adapters |
| Memory metadata | SQLite via `better-sqlite3` |
| Vector search | Qdrant |
| Embeddings | Ollama `nomic-embed-text` |
| Intelligence service | Python, FastAPI, Pydantic |
| NLP / ML | spaCy, sentence-transformers, scikit-learn |
| Graph | SQLite graph tables, custom traversal/query layer |
| Graph visualization | `react-force-graph-2d` |
| Optional backend | Express + WebSocket |

## Getting Started

### Prerequisites

- Node.js 18 or newer
- npm 9 or newer
- Docker, for Qdrant
- Python 3.10 or newer, for the intelligence service
- Ollama, for local models and embeddings

### 1. Clone and Install

```bash
git clone https://github.com/Yashasm18/Torvaix.git
cd Torvaix
npm install
```

### 2. Start Qdrant

```bash
docker compose up -d
```

Qdrant runs at:

```text
http://localhost:6333
```

### 3. Start Ollama

Install Ollama, then pull the embedding model and a chat model:

```bash
ollama pull nomic-embed-text
ollama pull llama3.2
```

Ollama should be available at:

```text
http://localhost:11434
```

### 4. Start the Python Intelligence Layer

```bash
cd services/python-agent
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Health check:

```text
http://localhost:8000/health
```

### 5. Start the Web App

From the repository root:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Useful routes:

```text
http://localhost:3000/app
http://localhost:3000/app/chat
http://localhost:3000/app/graph
http://localhost:3000/app/debug/memory
http://localhost:3000/app/debug/context
```

## Optional Self-Hosting Backend

The repository also contains an experimental Express/WebSocket backend:

```bash
node packages/agent/src/server.js
```

It includes endpoints for registration, login, conversations, agent runs, health checks, and WebSocket message updates. Treat this as an evolving backend path; the main app experience currently runs through the Next.js workspace.

## Development Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start workspace development scripts. |
| `npm run build` | Build workspace packages/apps. |
| `npm run lint` | Run ESLint across workspaces. |
| `npx tsc --noEmit` | Run TypeScript checks in the current package. |
| `node test-agent-loop.js` | Exercise the agent loop. |
| `npx tsx scripts/test-graph.ts` | Exercise graph behavior, depending on local setup. |

## Current Verification Notes

The codebase is moving quickly. Current known local verification state:

- The graph-aware chat route type-checks after the latest memory/graph changes.
- Full workspace lint currently reports existing issues in debug pages, graph UI typing, and some unused imports.
- Full web TypeScript check currently reports existing issues in the graph page and hero canvas component.
- Qdrant, Ollama, and the Python service must be running for the full memory pipeline to work end to end.

## TORVAIX vs Odysseus

Odysseus is a broad self-hosted AI workspace for chat, agents, research, documents, email, notes, calendar, local model workflows, and model operations.

TORVAIX is intentionally different.

```text
Odysseus: run your own AI workspace.
TORVAIX: build a living knowledge system over your work.
```

TORVAIX should win by becoming memory-first and knowledge-first:

- better long-term context,
- better project memory,
- better relationship tracking,
- better graph reasoning,
- better transparency into what the AI knows,
- better local ownership of personal knowledge.

The ambition is not to copy every workspace feature. The ambition is to make every feature strengthen memory, knowledge, context, or reasoning.

## Roadmap

### Phase 1: Workspace UI

- Workspace dashboard
- Global navigation
- Command palette
- Agent chat interface
- Persistent right context panel
- Knowledge pulse direction

### Phase 2A: Persistent Memory

- Ollama embeddings
- Qdrant vector database
- SQLite metadata store
- Semantic memory search
- Automatic context injection

### Phase 2.6: Python Intelligence Layer

- Memory categorization
- Entity extraction
- Tag generation
- Importance scoring
- Relationship detection

### Phase 2.7: Knowledge Graph

- Graph node storage
- Graph edge storage
- Relationship persistence
- Graph traversal
- Graph querying
- Interactive graph visualization

### Phase 2.8: Intelligence Routing

Next package: `packages/intelligence`

Planned capabilities:

- task routing,
- model selection,
- provider abstraction,
- cost tracking,
- fallback handling,
- privacy-aware routing,
- local-first routing policies.

Example future routing:

```text
Coding task        -> strong coding model
Research task      -> reasoning + search model
Memory retrieval   -> local embedding model
Graph reasoning    -> local or low-cost model
Sensitive context  -> local-only model
```

### Phase 3: Desktop Application

- Tauri desktop shell
- local service orchestration
- first-run setup
- local status monitor

### Phase 4: Shared Knowledge

- teams,
- organizations,
- shared workspaces,
- permissioned knowledge graphs.

## Design Principles

- **Memory-first**: if something matters, the system should be able to remember it.
- **Knowledge-first**: memory should become structured, searchable knowledge.
- **Relationship-first**: facts are more useful when connected.
- **Local-first**: private knowledge should stay under user control.
- **Privacy-first**: cloud providers should be optional and explicit.
- **Open source**: users should be able to inspect, modify, and self-host the system.

## Origin

> I was free, learning nothing from college, sat down in silence, thought of AI. I prompted my idea. The result was right in front of me.

## License

MIT. See [LICENSE](./LICENSE).

---

**TORVAIX** — an AI workspace that remembers, understands, and grows.
