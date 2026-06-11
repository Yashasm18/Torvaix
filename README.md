# Torvaix

**A workspace-first AI operating system. Local-first, privacy-first, no telemetry.**

🌐 **Live Website:** [https://Yashasm18.github.io/Torvaix](https://Yashasm18.github.io/Torvaix)

Torvaix is a self-hosted interface for working with language models. Chat, autonomous agents, tools, model serving, email integration, deep research, and more — all running on your hardware. Your data never leaves your machine.

---

## Why Torvaix

Most AI tools send your data to the cloud, lock you into a subscription, and give you no control over how your information is used. Torvaix takes a different approach:

- **Runs on your machine.** Every model call, every conversation, every file stays local.
- **No telemetry.** We do not phone home. There is no analytics, no tracking, no usage reporting.
- **You own your data.** Conversations are stored in your browser's IndexedDB. There is no central server.
- **Works offline.** Point it at a local Ollama instance and disconnect from the internet entirely.
- **Open source.** Read the code, audit it, fork it, contribute to it.

---

## Features

| Feature | Description |
|---|---|
| **Chat and Agents** | Multi-turn chat with autonomous agents that plan, call tools, and work through complex tasks. |
| **Tools and MCP** | Built-in tools (bash, files, web, memory) plus support for any MCP server you connect. |
| **Cookbook** | Hardware-aware model recommendations and one-click serving across 270+ catalogued models. |
| **Email Assistant** | AI summaries, style-matched draft replies, auto-tagging, and spam triage over IMAP/SMTP. |
| **Deep Research** | Multi-step research runs that gather, read, and synthesize sources into a written report. |
| **Compare** | Send one prompt to several models at once and compare their answers side by side. |
| **Memory** | Persistent memory the assistant builds up and recalls across all your conversations. |
| **Skills** | The assistant writes, refines, and reuses its own skills — getting more capable over time. |
| **Privacy** | No telemetry. No cloud storage. Runs against your own endpoints. Optional external integrations only when you choose them. |

---

## Architecture

Torvaix is structured as an npm workspaces monorepo:

```
torvaix/
├── apps/
│   └── web/          # Next.js 16 frontend (App Router)
├── packages/
│   ├── agent/        # Local agent loop with OS-level tools
│   ├── providers/    # LLM provider adapters (Ollama, OpenAI, Anthropic, Google)
│   ├── router/       # Request routing and model selection
│   ├── types/        # Shared TypeScript types
│   └── ui/           # Shared UI components
├── package.json      # Root workspace config
└── LICENSE
```

### Tech stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4, Framer Motion, shadcn/ui
- **State:** Zustand for client state, IndexedDB (via idb-keyval) for persistence
- **AI SDK:** Vercel AI SDK with adapters for OpenAI, Anthropic, Google, and Ollama
- **Agent:** Custom agent loop with tool calling (bash, file system, web search, memory)
- **Monorepo:** npm workspaces

---

## Getting started

### Prerequisites

- Node.js 18 or later
- npm 9 or later
- (Optional) [Ollama](https://ollama.ai) for local model inference

### Installation

```bash
git clone https://github.com/Yashasm18/Torvaix.git
cd Torvaix
npm install
```

### Running the development server

```bash
npm run dev
```

The web app will be available at `http://localhost:3000`.

### Connecting to local models

1. Install and start [Ollama](https://ollama.ai).
2. Pull a model: `ollama pull llama3.2`
3. Open Torvaix, go to **Settings > Local AI**, and verify the Ollama endpoint is `http://localhost:11434`.
4. Start chatting. All inference happens on your machine.

### Using API providers (optional)

If you want to use cloud providers alongside local models:

1. Go to **Settings > API Keys**.
2. Enter your keys for OpenAI, Anthropic, or Google.
3. Keys are stored locally in your browser. They are never sent to any Torvaix server.

---

## Development

### Project commands

| Command | Description |
|---|---|
| `npm run dev` | Start all workspaces in development mode |
| `npm run build` | Build all workspaces for production |
| `npm run lint` | Run linting across all workspaces |

### Working on a specific package

```bash
# Run only the web app
cd apps/web && npm run dev

# Run only the web app on a specific port
cd apps/web && npm run dev -- -p 3001
```

---

## Contributing

Contributions are welcome. Whether it is a bug fix, a new feature, better documentation, or a typo correction — all of it helps.

1. Fork the repository.
2. Create a branch: `git checkout -b feature/your-feature`
3. Make your changes and commit: `git commit -m "Add your feature"`
4. Push to your fork: `git push origin feature/your-feature`
5. Open a pull request.

Please keep pull requests focused. If you are making unrelated changes, open separate PRs.

---

## Origin story

> I was free, learning nothing from college, sat down in silence, thought of AI. I prompted my idea. The result was right in front of me.

---

## License

MIT. See [LICENSE](./LICENSE) for details.

---

**Torvaix** — Yours for the voyage.
