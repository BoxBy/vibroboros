# Progress Report

**Status:** In Progress

The core architecture of the Viper AI Partner (extension wiring, Model Context Protocol (MCP) tool server, A2A server, Orchestrator, and React UI) is implemented and usable. Advanced context management, long‑term memory, and comprehensive testing are **partially implemented** and still under active development.

## 1. Completed (Code Today)

- **Core Extension Wiring**
  - `src/extension.ts` delegates activation to `src/vs/ai-partner/extension.ts`.
  - AI Partner entrypoint initializes `ConfigService`, `AuthService`, `LLMService`, `DeveloperLogService`, diagnostics, and the main webview provider.

- **Model Context Protocol (MCP) Tool Server & Tools**
  - `server/MCPServer.ts` hosts tools such as FileRead/Write/Append/Delete, Mkdir/Move/Copy/ListDir/Stat, TerminalExecution, GitAutomation, WebSearch, SecurityVulnerability, Memory, Gitignore, Lint, TaskCompletion, and BrowserOpen.
  - The extension uses the MCP SDK’s in‑process transport (or a local duplex fallback) and exposes a routed `mcpClient` to agents.

- **A2A Server & Specialist Agents**
  - `a2a_server.ts` runs an Express-based HTTP A2A server with `InMemoryTaskStore` for each agent.
  - Normalizes `message.parts` to always include a text part and, when available, an A2A data part (`application/vnd.a2a+json`) containing `filePath` and `correlation`.
  - Hosts specialist agents such as `CodeAnalysisAgent`, `RefactoringSuggestionAgent`, `DocumentationGenerationAgent`, `ReadmeGenerationAgent`, `SecurityAnalysisAgent`, `CodeWatcherAgent`, `TaskDecompositionAgent`, `BrainstormAgent`, `ProgressTrackingAgent`, `ContextArchiveAgent`, `AILedLearningAgent`, `GitignoreGenerationAgent`, and the unified `CodeEditAgent`.

- **Orchestrator & Plan Execution**
  - `OrchestratorAgent` lives inside the extension host, owns chat sessions in `workspaceState`, and handles messages from the webview.
  - Builds execution plans, dispatches steps to specialist agents via A2A, and advances or completes steps based on agent responses.
  - Implements correlation-based idempotency as designed in `docs/design-correlation-idempotency.md` using `planId`/`stepId`/`executionId (runId)` and a handled-executions set.
  - On plan completion, synthesizes dynamic post-actions from produced artifacts and prompts the user to run follow-up tasks.

- **UI & Diff Workflow**
  - React-based webview UI renders chat, plans, and diff views.
  - Diff panels support Accept / Decline / Accept (Always) flows.
  - The backend sends `statusUpdate` messages so the UI can show progress during long-running steps.

## 2. Partially Implemented

- **Intelligent Context Management (Scaffold Only)**
  - `LLMService` defines `LlmMessage.pruningState?: 'pending' | 'keep' | 'prune'` and supports streaming responses.
  - Orchestrator maintains `llmConversationHistory` and performs light-weight summarization for **session titles**.
  - **Not yet implemented end-to-end:**
    - Parsing `<prunable>...</prunable>` regions from prompts and marking messages as prunable.
    - Automatic pruning / summarization of long histories before LLM calls.
    - Regenerating pruned histories with placeholders in a production-ready way.

- **Long-Term Memory (ContextArchiveAgent)**
  - `ContextArchiveAgent` is implemented and hosted by the A2A server.
  - It can, in principle, archive and search context using VS Code persistence (`vscode.Memento`).
  - **Missing glue today:** full archive/search flows wired into `OrchestratorAgent` (automatic archiving of discarded context and retrieval on demand).

## 3. Open Work

- **Context Management & Memory**
  - Finish the pruning/summarization pipeline described in `PLAN.md`.
  - Wire `ContextArchiveAgent` into Orchestrator so that pruned context is archived and relevant history can be recalled.

- **Testing**
  - Populate `src/test` and `src/vs/ai-partner/testing` with real unit tests for `LLMService`, MCP tools, services, and agents.
  - Add integration tests that cover UI → Orchestrator → MCP/A2A → UI round trips.

- **UI & UX**
  - Turn streaming responses into a first-class experience (progressive rendering, clearer error states).
  - Continue polishing the chat/plan/diff views and status banners.

- **Documentation Hygiene**
  - Keep `PLAN.md`, `PROGRESS.md`, `TASK.md`, `docs/*.md`, and all `_folder_overview*.md` files synchronized with the actual behaviour of the codebase.
