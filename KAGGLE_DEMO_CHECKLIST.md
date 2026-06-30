# Kaggle Demo Verification Checklist

This checklist verifies that the core features of Torvaix V1 are production-ready for the Kaggle submission.

### 1. Identity Test
- [ ] Ask: "What is your name?"
- [ ] Torvaix should confidently identify itself as "Torvaix", a workspace-first AI Operating System, and not as ChatGPT or a generic AI.

### 2. Memory Persistence Test
- [ ] Ask: "Note to self: my secret launch code is PROJECT_X"
- [ ] Hard refresh the application (clear the local memory context).
- [ ] Ask: "What is my secret launch code?"
- [ ] Torvaix must retrieve the memory from the SQLite/Qdrant vector database and answer correctly.

### 3. Repo Analysis Test (Workspace Intelligence)
- [ ] Ask: "Analyze the Torvaix repository and explain the architecture."
- [ ] Torvaix must invoke the `repo_scan` tool, parse `package.json` and the file tree, and accurately summarize the tech stack and folder structure.

### 4. Sidebar Navigation Test
- [ ] Click on every item in the left sidebar (Workspace, Projects, Knowledge, Graph, Agents, Tasks, Intelligence, Automation).
- [ ] Verify that every route loads successfully without a 404 error (specifically the `/workspace` fix).

### 5. File Creation Test (Tool Execution)
- [ ] Ask: "Create a simple Python script called hello.py that prints hello world."
- [ ] Approve the `write_file` tool call.
- [ ] Verify that `hello.py` is physically created in the project root.

### 6. Web Research Test (Tool Reliability)
- [ ] Ask: "Search the web for the latest news on local LLM models."
- [ ] Approve the `web_search` tool call.
- [ ] Verify that Torvaix retrieves live search results from DuckDuckGo and synthesizes an answer without timing out.
