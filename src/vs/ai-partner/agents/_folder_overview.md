# Folder: src/vs/ai-partner/agents

## Role
This directory contains the specialized AI agents that implement the core behaviours of the AI Partner. Each `*Agent.ts` file implements the `AgentExecutor` interface from `@a2a-js/sdk/server` and is hosted by the local HTTP A2A server.

## Agent Groups
- **Core Orchestration**
  - `OrchestratorAgent.ts` – Central "brain" that owns chat sessions, builds and executes plans, calls Model Context Protocol (MCP) tools, and dispatches steps to specialist agents via A2A.

- **Code Understanding & Modification**
  - `CodeAnalysisAgent.ts` – Indexes and analyzes code, provides symbol and structural information.
  - `RefactoringSuggestionAgent.ts` – Suggests refactorings to improve readability, structure, or performance.
  - `CodeEditAgent.ts` – Unified code-editing agent for creating/updating files, applying diffs, and adding documentation comments while preserving behaviour.
  - `TestGenerationAgent.ts` – Proposes or generates unit/integration tests for code under review.

- **Documentation & Project Assets**
  - `DocumentationGenerationAgent.ts` – Produces technical documentation for code.
  - `ReadmeGenerationAgent.ts` – Generates or refreshes `README.md` content from project context.
  - `GitignoreGenerationAgent.ts` – Builds `.gitignore` files based on project layout and templates.

- **Context, Memory & Learning**
  - `ContextManagementAgent.ts` – Gathers and filters context (open files, selections, diagnostics, search results) for LLM calls.
  - `ContextArchiveAgent.ts` – Designed to archive and search long-term context beyond the active chat history.
  - `AILedLearningAgent.ts` – Records user feedback and preferences to influence future suggestions.
  - `ProgressTrackingAgent.ts` – Tracks project/task progress and updates planning documents.
  - `BrainstormAgent.ts`, `TaskDecompositionAgent.ts` – Help turn vague goals into structured tasks and plans.

- **Background & Safety**
  - `CodeWatcherAgent.ts` – Listens for file save events and triggers background indexing or security checks.
  - `SecurityAnalysisAgent.ts` – Runs security-oriented analyses and can surface findings to the VS Code Problems panel.

## AI Reading Guide
- Start with `OrchestratorAgent.ts` to understand how plans are created, how A2A and Model Context Protocol (MCP) are used, and how correlation-based idempotency is enforced.
- Then inspect individual specialist agents when you need to understand or extend a specific capability (e.g. `RefactoringSuggestionAgent.ts` for refactor flows).
- The A2A server wiring for these agents is defined in `a2a_server.ts`.
