# Contributing to Torvaix

Thanks for contributing to Torvaix.

Torvaix is a workspace-first AI Operating System built around persistent memory, multi-agent orchestration, and local-first tool execution. The best contributions are focused, easy to review, and easy to test.

## Before You Start

Before opening an issue or pull request:

* Search existing issues first.
* Keep pull requests focused on a single feature or fix.
* Avoid broad rewrites or unrelated cleanup.
* If working on a large feature, open an issue first and explain the approach.

Small, clear pull requests are easier to review and merge.

---

## Development Setup

Torvaix is designed for local-first development.

### Clone the repository

```bash
git clone https://github.com/Yashasm18/Torvaix.git
cd Torvaix
```

### Install dependencies

```bash
npm install
```

### Start local services

```bash
docker compose up -d
```

This starts:

* Qdrant
* supporting backend services

### Start Ollama

```bash
ollama serve
```

Pull models if needed:

```bash
ollama pull llama3.2
```

### Run Torvaix

```bash
npm run dev
```

Torvaix will open automatically at `http://localhost:3000`

---

## Running Checks

Before submitting changes:

Run type checks:

```bash
npm run typecheck
```

Run linting:

```bash
npm run lint
```

Run tests:

```bash
npm run test
```

For Docker changes:

```bash
docker compose config
docker compose up -d --build
```

Mention what you tested in your pull request.

---

## Pull Requests

Good pull requests usually include:

* What problem is being solved
* What files were changed
* How it was tested
* Screenshots or recordings for UI changes

Please keep pull requests small.

Large pull requests mixing refactors, formatting, and feature changes are harder to review.

---

## Visual Changes

Torvaix has an intentional product design language.

If your change affects:

* UI
* layout
* components
* colors
* typography
* animations

Please:

* run the app locally
* test in browser
* attach screenshots
* preserve the existing visual system

Do not introduce inconsistent UI patterns.

Extend existing components where possible.

---

## Code Conventions

Keep the codebase consistent.

* Use existing helpers and utilities before creating new ones.
* Avoid hardcoded paths or duplicated constants.
* Reuse shared types and schemas.
* Keep logic modular.
* Prefer composition over duplication.

If adding new environment variables, document them.

If adding new MCP tools, document permissions clearly.

---

## Commit Format

Use Conventional Commits:

Examples:

```text
feat(memory): add semantic chunk retrieval
fix(router): improve tool classification
docs(readme): update setup flow
refactor(agent): simplify execution graph
```

Common types:

* feat
* fix
* docs
* refactor
* test
* chore

---

## Security

Torvaix includes privileged execution capabilities:

* filesystem access
* terminal execution
* Python execution
* MCP tools

Treat these carefully.

Do not submit insecure defaults.

Follow `SECURITY.md` for security-related issues.

---

## Reporting Issues

For bugs include:

* operating system
* install method
* reproduction steps
* expected behavior
* actual behavior
* logs or screenshots

For agent/tool issues include:

* model used
* MCP tools involved
* execution logs
* workspace state if relevant

Clear issues are easier to fix.

---

Build carefully.
Ship responsibly.
Keep it local.
