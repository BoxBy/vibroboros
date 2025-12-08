# Folder: src/vs/ai-partner

## Role
This directory contains the core "AI Partner" subsystem. It wires together the Orchestrator agent, the in‑process Model Context Protocol (MCP) tool server, the local HTTP A2A server, shared services, and the React webview UI.

## Structure Overview
- **`extension.ts`** – AI Partner entrypoint called from `src/extension.ts`. Initializes services, starts the MCP server, starts the A2A server, constructs the `OrchestratorAgent`, and registers the main webview provider.
- **`AIPartnerViewProvider.ts`** – Manages the webview panel, forwards UI messages to the Orchestrator, and receives responses (chat, plans, diffs, status updates).
- **`a2a_server.ts`** – Express‑based HTTP A2A server hosting specialist agents (CodeAnalysis, RefactoringSuggestion, DocumentationGeneration, SecurityAnalysis, CodeWatcher, ContextArchive, CodeEdit, etc.). Normalizes `message.parts` and injects correlation and filePath into A2A data payloads.
- **`server/`** – Contains `MCPServer.ts` and the Model Context Protocol (MCP) tools under `server/tools/` that provide file I/O, terminal, git, web search, security scanning, memory, linting, and other capabilities.
- **`services/`** – Shared services such as `LLMService`, `DeveloperLogService`, `ConfigService`, `AuthService`, and streaming/terminal helpers.
- **`agents/`** – `OrchestratorAgent.ts` (central brain) plus many specialist agents hosted by the A2A server.
- **`interfaces/`** – Core data contracts such as `A2AMessage` and code data structures.
- **`ui/`** – React/Vite webview UI (chat, plan view, diff view, status messages).
- **`testing/`** – Tests specific to the AI Partner subsystem (currently mostly scaffolding).

## AI Reading Guide
- Read `extension.ts` in this folder to see how Model Context Protocol (MCP), A2A, services, and the Orchestrator are wired together.
- Then open `agents/OrchestratorAgent.ts` to understand plan creation, correlation-based idempotency, and how A2A/MCP are used.
- For tools and environment access, inspect `server/MCPServer.ts` and the files under `server/tools/`.
- For UI behaviour, start from `ui/MainView.tsx` and `ui/services/vscode.ts`.
