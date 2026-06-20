# Security Policy

Torvaix is a workspace-first AI Operating System designed to run with privileged local capabilities. It can store persistent memory, execute tools, read and write files, and orchestrate workflows through Model Context Protocol (MCP).

Because of this, Torvaix should be treated as trusted local infrastructure — not as a publicly exposed application by default.

## Supported Versions

Security patches and fixes are maintained on the default branch until formal release versions are established.

## Security Philosophy

Torvaix follows a local-first, privacy-first model.

Your conversations, memory, embeddings, execution logs, and knowledge remain under your control. The system is intentionally designed to minimize external dependencies and avoid telemetry.

However, local control also means local responsibility.

If you deploy or expose Torvaix beyond your machine, you are responsible for securing access to it.

## Deployment Recommendations

For local development, Torvaix is intended to run on localhost and isolated Docker services.

For production or network-accessible deployments:

Always place Torvaix behind authentication.

Always use HTTPS.

Always keep internal services private.

This includes:

* Ollama
* Qdrant
* SQLite-backed data
* MCP servers
* internal APIs

These services should never be exposed directly to the public internet.

Torvaix should act as the only public entry point.

## Tool Execution & Privileged Actions

Torvaix includes powerful execution capabilities such as:

filesystem access, terminal commands, Python execution, and MCP tool orchestration.

These are privileged actions.

Any deployment should treat them accordingly.

Torvaix uses approval-gated execution for dangerous actions. This means destructive commands, sensitive file mutations, and high-risk operations require explicit user approval before continuing.

This layer should never be disabled in serious deployments.

## Data Protection

Torvaix stores important local data including:

workspace history, semantic memory, uploaded files, execution logs, and vector embeddings.

Protect these carefully.

Never commit the following to public repositories:

* `.env`
* local databases
* API keys
* provider tokens
* logs
* uploaded documents
* memory stores
* backups

If these are exposed, rotate credentials immediately.

## MCP Security

Torvaix uses Model Context Protocol (MCP) to connect tools like filesystem, terminal, and browser capabilities.

MCP should be treated as privileged infrastructure.

Only run MCP servers locally or inside trusted private environments.

Do not expose MCP transports publicly.

Restrict tool scopes whenever possible.

Audit connected tools before use.

## Model Provider Security

Torvaix supports both local and external model providers.

For local providers such as Ollama:

keep them private and internal-only.

For external providers:

store API keys securely, restrict scopes where possible, and rotate them regularly.

Never expose provider credentials in logs, screenshots, or shared demos.

## Publishing a Public Fork

Before making your fork public, verify that no sensitive files or secrets are being committed.

Review:

* environment files
* logs
* database files
* uploaded files
* execution history
* tokens

Torvaix is designed to be open-source — your private data is not.

## Reporting Vulnerabilities

If you discover a security issue, please report it responsibly.

Use GitHub Security Advisories where available, or open a minimal private issue without disclosing exploit details publicly.

Responsible disclosure helps keep Torvaix secure for everyone.

---

*Your data belongs to you. Keep it that way.*
