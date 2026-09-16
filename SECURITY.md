# Security Policy

## Reporting a vulnerability

Please don't report security problems in public issues or discussions.

Report them privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Please include:

- the affected version or commit
- steps to reproduce, or a proof of concept
- the impact you expect (for example, command execution or data exposure)

We aim to acknowledge reports within 7 days. Once a fix is released, we'll credit you in the advisory unless you'd rather stay anonymous. Torvaix is maintained by volunteers, so we can't promise fix timelines.

## Supported versions

Only the latest commit on `main` receives security fixes. Torvaix is pre-1.0, and older releases aren't patched.

## Threat model

Torvaix is designed for **one person on their own computer**. The agent can run shell commands and Python code as your user account, so treat access to Torvaix like access to your terminal.

It is **not** designed to be exposed to the internet or shared with people you don't trust. There is no user isolation: everyone who can reach the app shares the same workspaces, memories and tools.

## What protects you today

| Protection | Details |
| --- | --- |
| Loopback binding | The web app and the agent server listen on `127.0.0.1` unless you set `WEB_HOST` or `AGENT_HOST`. The Docker Compose file publishes every port on `127.0.0.1` only. |
| Origin and Host checks | The agent rejects browser requests from other origins, and requests whose `Host` isn't localhost or listed in `AGENT_ALLOWED_HOSTS`. This blocks DNS-rebinding attacks. |
| CSRF check | The web app's API routes reject cross-site state-changing requests. |
| Approval for code execution | `bash` and `python` tool calls pause until you approve them in the UI. Each approval covers exactly one command and can be used only once. |
| Workspace confinement for files | `read_file` and `write_file` can't reach paths outside the workspace folder. |
| Input validation and rate limits | Request bodies are validated, and the API is rate-limited. |
| Timeouts | Shell and Python commands are stopped after 15 seconds. |

## Known limitations

Know these before you run Torvaix anywhere other than your own machine:

- **Approved commands aren't sandboxed.** An approved `bash` or `python` call runs with your full user permissions. It starts in the workspace folder but can read or change anything your account can. Read each command before approving it.
- **Login isn't required.** Requests to the agent without a `Bearer` token run as a default local user. The login endpoints exist, but they don't protect anything yet.
- **The web app has no login.** Anyone who can open it can use Torvaix, including approving commands. It listens only on this computer by default. If you set `WEB_HOST` to another address, put the app behind a firewall or an authenticating reverse proxy.
- **Companion device scopes aren't enforced.** The experimental pairing endpoints issue `readonly` and `admin` sessions, but no other endpoint checks them yet.
- **Prompt injection.** Web search results, files and stored memories go into the model's context and can try to steer it. The approval step is your defence, so don't approve commands you didn't expect.

## Data and privacy

Torvaix doesn't collect telemetry. Data leaves your machine only in these cases:

- **Cloud models.** When you choose a cloud model, your prompts and relevant memories go to that provider.
- **Web search.** The `web_search` tool sends queries to DuckDuckGo, Bing and Wikipedia.
- **Embeddings fallback.** If `OPENAI_API_KEY` is set and Ollama can't create embeddings, memory text goes to OpenAI.
- **Fonts.** Each page load requests a font stylesheet from Fontshare. Google Fonts are downloaded once, when the app is built.

Everything else is stored under `TORVAIX_HOME` (default `~/.torvaix`), in Qdrant if you run it, and in your browser's IndexedDB for chat history. These files aren't encrypted. Rely on disk encryption, and never commit `.env`, `*.db` files or the `~/.torvaix` folder. If a key leaks, rotate it with the provider.

## If you deploy beyond localhost

- Put Torvaix behind HTTPS and an authenticating reverse proxy.
- Don't publish ports 3001 (agent), 6333 (Qdrant), 11434 (Ollama) or 8000 (NLP service).
- Run it in a container or VM, as a user with access only to the data it needs.
- Set `AGENT_ALLOWED_ORIGINS` and `AGENT_ALLOWED_HOSTS` to exactly the names you use.
