# Setup guide

This guide goes a little deeper than the [README](../../README.md): what each piece does, how to check that it works, and what to do when it doesn't. For contributing, see [CONTRIBUTING.md](../../CONTRIBUTING.md); for security, see [SECURITY.md](../../SECURITY.md).

## Requirements

- **Node.js 22 or newer** and npm
- **[Ollama](https://ollama.com)**, running locally, for the chat model and for embeddings
- **Docker** *(optional)*, for Qdrant (vector search) and the Python NLP service

Local models are demanding. As a rough guide, a 3B model such as `llama3.2:3b` is comfortable with 8 GB of RAM; bigger models want 16 GB or a GPU.

## Install and run

On macOS and Linux the quickest way is the installer, which does the four commands below for you:

```bash
curl -fsSL https://raw.githubusercontent.com/Yashasm18/Torvaix/main/install.sh | sh
```

Or by hand:

```bash
git clone https://github.com/Yashasm18/Torvaix.git
cd Torvaix
npm install
cp .env.example .env
```

Pull the models:

```bash
ollama pull llama3.2
```

```bash
ollama pull nomic-embed-text
```

Optionally start Qdrant. Without it, memory search uses keyword matching, which still works:

```bash
docker compose up -d qdrant
```

Start Torvaix:

```bash
npm run dev
```

Open <http://localhost:3000>. The agent server runs on `127.0.0.1:3001`; you don't open it directly.

> Don't run a bare `docker compose up -d` while developing. It also starts the packaged app container, which publishes the same ports as `npm run dev`.

## How it fits together

- **Web app** (`localhost:3000`): the interface. Its API routes forward requests to the agent server.
- **Agent server** (`127.0.0.1:3001`): decides what each message needs (recall a memory, store a fact, answer, or call a tool), talks to the model, and runs tools.
- **SQLite**: the source of truth for memories, workspaces, approvals and the knowledge graph. It lives under `~/.torvaix` (or `TORVAIX_HOME`).
- **Qdrant** *(optional)*: vector search over your memories. The agent checks for it every 30 seconds, so you can start it at any time, and it indexes memories you saved before it was running.
- **Ollama**: runs the chat model and creates embeddings.

For the full picture and the package list, see the [architecture section of the README](../../README.md#architecture).

## Check that it works

Create a workspace in the UI, then try these in a chat.

**1. Store a fact**

```text
Remember that my favorite framework is Next.js
```

**2. Recall it in a new chat**

```text
What is my favorite framework?
```

**3. Approve a command.** `bash` and `python` commands always pause for approval, and the approval card shows exactly what will run:

```text
Run the bash command: echo hello from torvaix
```

Read the command on the card, approve it, and the output appears in the chat. Writing files in the workspace folder and searching the web don't need approval.

You can also check the services directly:

```bash
curl http://localhost:3001/api/health
```

It reports whether SQLite, Qdrant and Ollama are reachable, and which chat model is in use.

## Configuration

Choose the chat model and add API keys for cloud providers in the app, under **Settings → Models & keys**. Use **Test** there to check a key and model before you rely on them.

Everything else is optional. Put settings in `.env` in the repository root (see `.env.example`); variables already set in your shell win. The full table is in the [README](../../README.md#configuration). The ones people usually change:

| Variable | Why |
| --- | --- |
| `TORVAIX_MODEL` | Use a specific chat model instead of the auto-selected installed one (a model chosen in Settings wins) |
| `PORT` / `AGENT_PORT` | Run on other ports if 3000 or 3001 are taken. If you change `AGENT_PORT`, set `AGENT_SERVER_URL` to match. |
| `TORVAIX_HOME` | Keep your data somewhere other than `~/.torvaix` |
| `OPENAI_API_KEY` and friends | Enable cloud models without using Settings |

## Troubleshooting

### The agent crashes with "compiled against a different Node.js version"

SQLite's native module was built for another Node version, usually after switching versions with nvm or Homebrew. `npm run dev` rebuilds it automatically. To do it by hand:

```bash
npm rebuild better-sqlite3
```

### A port is already in use

`npm run dev` stops a leftover Torvaix server from this folder on its own. If another program holds the port, it tells you which one (pid and command) and exits; it never kills programs it doesn't recognise. Stop that program, or set `PORT` / `AGENT_PORT`.

### Chat says it couldn't reach Ollama

Start it and check the model is installed:

```bash
ollama serve
```

```bash
ollama list
```

If the model is missing, the error names the `ollama pull` command to run.

### Memory search is weak or only matches exact words

That's keyword-only search. Check the vector side:

1. Ollama is running and `nomic-embed-text` is installed.
2. Qdrant is running: `docker compose ps qdrant`. Start it with `docker compose up -d qdrant`.
3. Wait up to 30 seconds, then check `curl http://localhost:3001/api/health`.

### The dev server shows a "1 Issue" badge after pulling changes

Usually a stale Next.js cache after routes were renamed. Clear it and restart:

```bash
rm -rf apps/web/.next
npm run dev
```

## Using Torvaix from another device

By default both servers listen only on `127.0.0.1`. Torvaix has no login, and anyone who can open it can approve commands that run as you, so the safest way to reach it from elsewhere is an SSH tunnel to the machine it runs on:

```bash
ssh -L 3000:localhost:3000 you@your-machine
```

Then open <http://localhost:3000> on the device you're connecting from.

If you really need it reachable on your network, set `WEB_HOST=0.0.0.0` in `.env`. Only do this on a network you trust, behind a firewall or an authenticating reverse proxy with HTTPS. Never expose the agent port (3001), Qdrant, Ollama or the NLP service. See [SECURITY.md](../../SECURITY.md).

## Updating

```bash
git pull
npm install
```

Then restart `npm run dev`. If you run the Docker stack, rebuild it:

```bash
docker compose up -d --build
```

Your data stays in `~/.torvaix` (or the `torvaix_data` volume for Docker), so updates don't touch it.
