# Folder: src

## Role
This is the root directory for all source code of the Viper VS Code extension.

## Structure Overview
- **`extension.ts`** – Root extension entrypoint. It wires VS Code activation into the AI Partner subsystem under `vs/ai-partner/` and initializes secret storage.
- **`vs/`** – Host‑integrated features that depend directly on the VS Code APIs. Currently this is almost entirely the `ai-partner` feature.
- **`test/`** – Top‑level tests for the extension (e.g. `extension.test.ts`). More feature‑specific tests live under `vs/ai-partner/testing/`.

## AI Reading Guide
- Start with `extension.ts` to see how the extension is activated and how it delegates to `vs/ai-partner/extension.ts`.
- Then move into `vs/ai-partner/_folder_overview.md` to understand the AI Partner architecture (Orchestrator, Model Context Protocol (MCP), A2A server, services, UI).
