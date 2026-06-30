# Torvaix Milestone Execution Plan
**Synthesized from ROADMAP.md**

This document converts the strategic vision from `ROADMAP.md` into an actionable, trackable milestone execution plan.

## Milestone 1: The Core Foundation (v1.0.x)
**Goal:** Stabilize the local environment and ensure absolute reliability of the existing routing, execution, and memory mechanics.
* [x] **Execution Transparency:** Implement live trace streaming (Agent Trace panel) for reasoning visibility.
* [x] **Smart Intent Routing:** Implement keyword fast-pathing to bypass the LLM for guaranteed memory/execution routing.
* [ ] **Workspace Intelligence:** Enrich SQLite/Qdrant metadata schemas to store file-paths and semantic clustering data.
* [ ] **Toolchain Hardening:** Containerize MCP `bash` and `python` tools for secure sandboxing. 

## Milestone 2: Companion & Network Expansion (v1.1.x)
**Goal:** Bridge the gap between isolated local instances, scaling from personal productivity to multi-device fluidity.
* [x] **Experimental LAN Pairing:** Build WebSocket-based secure QR code pairing for remote handoffs.
* [ ] **Companion E2E Encryption:** Hard-code Signal-protocol level encryption for the Companion app bridge.
* [ ] **Opt-in Cloud Sync:** Allow trusted instances to negotiate and delta-sync SQLite WAL logs.
* [ ] **Intelligent Model Routing:** Build the gateway that dynamically falls back from local LLaMA to cloud Anthropic/OpenAI if the prompt complexity score is too high.

## Milestone 3: Collaborative Intelligence (v1.2.x)
**Goal:** Introduce multiplayer workspaces.
* [ ] **Shared Memory Spaces:** Introduce granular Role-Based Access Control (RBAC) to Qdrant collections.
* [ ] **Team Execution Logs:** Allow multiple users to subscribe to a single agent's WebSocket execution feed.
* [ ] **Agent Task Ownership:** Let agents "claim" tasks from a shared BullMQ queue to prevent duplicate processing.

## Milestone 4: The Autonomous OS (v2.0)
**Goal:** Shift Torvaix from a conversational tool to a perpetual, background-operating environment.
* [ ] **Event-Driven Workflows:** Write listeners that trigger agent runs based on file-system changes or incoming webhooks.
* [ ] **Living Knowledge Graphs:** Implement the semantic clustering engine to automatically link entities without user prompting.
* [ ] **Background Research Agents:** Deploy isolated cron-job agents that index user data while the system is idle.
