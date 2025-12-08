# PLAN.md: Viper Project Blueprint

## 1. Project Overview

Viper is a multi-agent AI coding partner deeply integrated into VS Code. The system is built around a central Orchestrator agent, a local HTTP A2A (Agent-to-Agent) server, an in-process MCP (Model Context Protocol) tool server, and a modern React-based UI.

This document describes the **current, code-accurate architecture** and the **designed (but partially implemented) intelligent context management** features.

## 2. Core Architectural Model

### 2.1 Extension Entrypoint (`src/vs/ai-partner/extension.ts`)

The VS Code extension entrypoint wires together all major subsystems:

- **Services**
  - Initializes `ConfigService`, `AuthService`, `LLMService`, `DeveloperLogService`.
  - Creates a `vscode.DiagnosticCollection` for reporting problems.

- **In-Process MCP Server**
  - Calls `createMCPServer()` (`server/MCPServer.ts`) to register tools like `FileReadTool`, `FileWriteTool`, `TerminalExecutionTool`, `GitAutomationTool`, `WebSearchTool`, `MemoryTool`, `SecurityVulnerabilityTool`, `TaskCompletionTool`.
  - Uses the official MCP SDK’s **in-memory transport** when available (`@modelcontextprotocol/sdk/inMemory`).
  - Falls back to a custom in-process duplex (`mcp_in_process_duplex.ts`) when the in-memory helper is not available.
  - Creates a `Client` from `@modelcontextprotocol/sdk/client` and connects it to the server transport.
  - All tool calls follow the SDK standard shape: `callTool({ name, arguments })`.

- **MCP Client Router**
  - Wraps the core MCP client with a routing layer that can:
    - Call the in-process tool server first.
    - Optionally route to external MCP servers defined in `.agent/mcp-servers.json` via `StdioClientTransport`.
  - Exposes a single logical `mcpClient` via `setMcpClient`, used throughout the agents.

- **Local HTTP A2A Server**
  - Computes an `agentBaseUrl` from the configured A2A port.
  - Creates a `dispatch` function that sends `A2AMessage` envelopes using `A2AClient.fromCardUrl` from `@a2a-js/sdk/client`.
  - Starts the Express-based A2A server with `startA2AServer`, passing:
    - The VS Code context and workspace state.
    - The MCP server instance (for tools).
    - `LLMService`, `AuthService`, `ConfigService`, diagnostics, and `DeveloperLogService`.
  - Uses a readiness barrier so that dispatch waits until the A2A server is fully started.

- **Orchestrator and UI**
  - Instantiates `OrchestratorAgent` with:
    - The `dispatch` function (for A2A),
    - MCP server, services, workspace state, diagnostics, and developer log service.
  - Registers `AIPartnerViewProvider` and wires webview messages to `OrchestratorAgent.handleUIMessage`.
  - For bulk file-change acceptance, coordinates MCP tool calls and notifies the Orchestrator via synthetic UI messages.

### 2.2 MCP Tool Server (`src/vs/ai-partner/server`)

- `MCPServer.ts` uses the MCP SDK’s `Server` to expose a set of tools to agents.
- Tools are located under `server/tools/` and follow the SDK’s request/response contracts.
- The Orchestrator and other agents interact with the local environment **only via MCP tools**, not by direct `fs` or `child_process` calls (except for carefully controlled cases such as UI test hooks).

### 2.3 Local HTTP A2A Server (`src/vs/ai-partner/a2a_server.ts`)

- Built on Express, hosting a set of **specialist agents** that implement the `AgentExecutor` interface from `@a2a-js/sdk/server`.
- Agent configurations are loaded from `.agent/a2a-servers.json` and merged with `DEFAULT_AGENT_CONFIGS` to guarantee core agents (e.g., `CodeAnalysisAgent`, `RefactoringSuggestionAgent`, `ReadmeGenerationAgent`, `CodeWatcherAgent`, `SecurityAnalysisAgent`, `ContextArchiveAgent`, etc.) are always available.
- For each registered agent:
  - The server creates an `InMemoryTaskStore` and wraps the executor in a thin shim that normalizes `message.parts` to comply with the A2A SDK.
  - It ensures that a `text` part is always present, and, when available, a `data` part with `application/vnd.a2a+json` containing fields like `filePath` and `correlation`.
  - It exposes a `.../card` endpoint so that `A2AClient.fromCardUrl` can discover and call the agent.
- **OrchestratorAgent itself is not hosted on the A2A server**; it is instantiated inside the extension process and uses `dispatch` to talk to the hosted specialists.

### 2.4 OrchestratorAgent (`src/vs/ai-partner/agents/OrchestratorAgent.ts`)

`OrchestratorAgent` is the central “brain” of Viper. It:

- Owns **chat sessions and history** stored in VS Code’s `workspaceState`.
- Receives messages from the React webview via `handleUIMessage`.
- Uses `LLMService` and prompt templates (`agents/prompts.ts`) to:
  - Classify user input (simple chat vs. complex task).
  - Generate minimal execution plans.
  - Route plan steps to specialist agents.
- Uses the MCP client for file-system and terminal operations via tools.

#### 2.4.1 Correlation-Based Idempotency

To avoid double-applying code changes or accidentally advancing plans due to late A2A messages, the Orchestrator implements **correlation-based idempotency**, as described in `docs/design-correlation-idempotency.md`:

- For each plan it creates a `planId` and per-step `stepId`.
- For each dispatched step it generates an `executionId` (alias `runId`).
- When sending A2A messages (e.g., `request-code-edit`, `request-brainstorm`, `request-refactoring-suggestion`), it attaches:
  - A `correlation` object both in the structured `task.data` and in a `data` part with `mimeType: 'application/vnd.a2a+json'`.
- When receiving `response-code-execution` (and similar) from agents, it:
  - Validates that `planId/workflowId`, `stepId`, and `executionId/runId` all match the **current in-progress step**.
  - Rejects mismatched or duplicate responses via an internal `handledExecutions` set.

This replaces earlier time-window guards with a deterministic, transport-agnostic contract.

#### 2.4.2 Plan and Post-Actions Lifecycle

- Builds a minimal plan from the user request and agent descriptions.
- Tracks per-step status: `pending`, `in-progress`, `completed`.
- For code changes requiring confirmation, surfaces diffs to the UI and only advances after acceptance.
- On plan completion, synthesizes **post-actions** (e.g., optional documentation or test generation) from produced artifacts and asks the user which to run.

### 2.5 Specialist Agents (`src/vs/ai-partner/agents/*.ts`)

The specialist agents are independent `AgentExecutor` implementations hosted by the A2A server. Examples:

- `CodeAnalysisAgent`: indexes and analyzes code, provides symbol searches and higher-level analyses using `LLMService`.
- `RefactoringSuggestionAgent`: proposes refactorings.
- `DocumentationGenerationAgent`, `ReadmeGenerationAgent`: generate documentation and README content.
- `SecurityAnalysisAgent`: performs security checks.
- `CodeWatcherAgent`: listens for file saves and triggers background indexing or security checks.
- `TaskDecompositionAgent`, `BrainstormAgent`, `ProgressTrackingAgent`, `ContextArchiveAgent`, `GitignoreGenerationAgent`, etc.

All inter-agent communication happens via the A2A protocol; they do not reach into each other’s internals directly.

## 3. User Interface (`src/vs/ai-partner/ui`)

- A modern React + Vite webview UI.
- `MainView.tsx` orchestrates the chat view, plans, and auxiliary panels.
- `services/vscode.ts` is the bridge between the webview and the extension host, wrapping `acquireVsCodeApi()` and providing typed message helpers.
- The UI renders:
  - Chat messages (user and agent).
  - Execution plans and step status.
  - Diff views and command confirmations.
  - Session management (create/select/delete chats).

## 4. Intelligent Context Management (Design)

In addition to the core architecture above, Viper is designed to support **intelligent context management** and **long-term memory**. Parts of this design are already reflected in the code; others are still to be implemented.

### 4.1 LLM Conversation History and Pruning

- `LLMService` defines an `LlmMessage` type with an optional `pruningState?: 'pending' | 'keep' | 'prune'` field.
- The long-term goal is:
  - Mark large, potentially disposable content (logs, file dumps, long code blocks) with `<prunable>...</prunable>` tags in system prompts.
  - Store assistant messages containing such content with `pruningState: 'pending'`.
  - On each new user message, decide whether recent prunable messages are still relevant and flip `pruningState` to `'keep'` or `'prune'`.
  - Build a pruned history for the next LLM call, replacing pruned message content with a short placeholder.

**Current status:**

- The type-level scaffolding (`pruningState` on `LlmMessage`) is present.
- The full `<prunable>` tagging, pruning, and history-summarization pipeline is **not yet implemented** and should be treated as planned work.

### 4.2 Conversation Summarization

Planned behaviour (not fully implemented):

- Track conversation length and, once it exceeds a threshold, summarize the oldest half of the history into a compact system message.
- Replace raw historical messages with a single “summary” message plus the newer, still-relevant messages.
- Use the summarized history when constructing the next LLM call.

In practice, `OrchestratorAgent` already performs light-weight summarization for chat **session titles**, but a full conversation-level summarization pipeline remains future work.

### 4.3 ContextArchiveAgent and Long-Term Memory

`ContextArchiveAgent` is designed to provide long-term memory beyond the active chat history:

- Archive:
  - Accept `archiveContext` messages containing either code or non-code content.
  - Decide which in-memory archive (code vs. non-code) to store the content in, using `vscode.Memento` for persistence when appropriate.

- Search:
  - Handle `searchArchivedContext` messages with a free-text query.
  - First search non-code archives; then search code archives if needed.
  - Reply with `response-archived-context` messages summarizing the most relevant matches.

- Orchestrator integration (planned):
  - When pruning or summarizing history, send discarded content to `ContextArchiveAgent`.
  - When the LLM or Orchestrator detects missing context, query `ContextArchiveAgent` and inject retrieved context back into `llmConversationHistory` before re-trying.

The agent class exists and is hosted by the A2A server, but the full archive/search workflows and orchestration hooks are **not yet complete**.

## 5. High-Level File Structure

At a high level, the relevant part of the repository looks like this:

```text
src/
  extension.ts                # Root extension entrypoint
  vs/
    ai-partner/
      extension.ts            # AI Partner subsystem entrypoint
      AIPartnerViewProvider.ts# Webview provider
      a2a_server.ts           # Local HTTP A2A server hosting specialist agents
      server/                 # MCP server and tools
      services/               # LLMService, DeveloperLogService, ConfigService, AuthService
      agents/                 # OrchestratorAgent + specialist agents
      interfaces/             # A2A and code data interfaces
      ui/                     # React webview UI
```

This PLAN.md, together with `docs/architecture.md` and `docs/design-correlation-idempotency.md`, should be treated as the **source of truth** for the current architecture. When the code diverges, update these documents to match the implementation.