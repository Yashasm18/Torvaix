# Contributing to Torvaix

Thanks for your interest in improving Torvaix. This guide covers how to set up the project, make a change and get it merged.

## Before you start

- Check [open issues](https://github.com/Yashasm18/Torvaix/issues) and pull requests to see whether someone is already working on it.
- For anything larger than a bug fix, open an issue first and describe your plan, so nobody spends time on a change that can't be merged.
- Report security problems privately, as described in [SECURITY.md](SECURITY.md), not in public issues.

## Setting up

You need Node.js 22 or newer and [Ollama](https://ollama.com). Docker is optional.

```bash
git clone https://github.com/Yashasm18/Torvaix.git
cd Torvaix
npm install
cp .env.example .env
ollama pull llama3.2
ollama pull nomic-embed-text
```

To use vector search, start Qdrant on its own. Don't run `docker compose up` without a service name during development: it also starts the app container, which takes ports 3000 and 3001.

```bash
docker compose up -d qdrant
```

Start the agent server and the web app:

```bash
npm run dev
```

The app is at <http://localhost:3000>, and the agent server is at `127.0.0.1:3001`.

To keep your development data separate from your normal Torvaix data, point `TORVAIX_HOME` at another folder:

```bash
TORVAIX_HOME=/tmp/torvaix-dev npm run dev
```

## Project layout

| Path | What lives there |
| --- | --- |
| `apps/web` | Next.js 16 UI and its API routes, which forward requests to the agent |
| `packages/agent` | Express server, orchestrator, validation, HTTP security |
| `packages/memory` | SQLite storage for memories, workspaces, automations and approvals |
| `packages/graph` | Knowledge graph |
| `packages/mcp` | Tool server (files, shell, Python, web search) and client |
| `packages/providers` | LLM provider client |
| `packages/events` | Automation engine |
| `packages/intelligence` | Memory consolidation |
| `services/python-agent` | Optional FastAPI NLP service |

> **Note:** `apps/web` uses Next.js 16, which differs from older versions in places. For example, middleware lives in `src/proxy.ts`. Check `node_modules/next/dist/docs` before relying on older examples.

## Checks

Run these before opening a pull request. CI runs the same checks on Node 22.

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm run test:ci
```

```bash
npm run build
```

`npm run typecheck` only covers packages that define a `typecheck` script. When you change the web app, also run:

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```

`npm test` starts Vitest in watch mode, which is handy while you work. Put tests next to the code in `__tests__` folders.

## Making changes

- Keep each pull request to one fix or feature, and leave unrelated refactors and reformatting for a separate PR.
- Follow the style of the surrounding code, and reuse existing helpers and types.
- Add or update tests for behaviour changes, especially in `packages/`.
- Document new environment variables in `.env.example` and in the README's configuration table.
- **UI changes:** check both light and dark themes and a narrow (phone-width) window, and include screenshots in the PR.
- **Database changes:** existing users already have data. Migrations must upgrade an existing `~/.torvaix` database without losing anything.

### Changes that affect security

Take extra care with anything that touches tool execution, file access, the approval flow, or the agent server's network settings:

- New tools that can change the system or run code must go through the approval flow, just like `bash` and `python`.
- File access must stay inside the workspace folder.
- Don't loosen the loopback binding, Origin/Host checks or CSRF checks by default.
- Explain the security impact in the PR description.

## Commits and pull requests

Commit messages use [Conventional Commits](https://www.conventionalcommits.org). Release notes and the changelog are generated from them by release-please.

```text
feat(memory): add date filter to memory search
fix(agent): reject approvals for another workspace
docs: clarify Docker setup
```

Common types are `feat`, `fix`, `docs`, `refactor`, `test` and `chore`.

In the pull request, explain:

- what changed and why (link the issue if there is one)
- how you tested it
- screenshots, for UI changes

## Reporting bugs

A useful bug report includes:

- your OS, Node version and how you run Torvaix (`npm run dev`, `npm start` or Docker)
- the model and provider you use
- steps to reproduce, and what you expected to happen
- relevant output from the agent server console or the browser console

Remove API keys and personal data from logs before posting them.

## License

By contributing, you agree that your contributions are licensed under the [GNU AGPL v3.0](LICENSE).
