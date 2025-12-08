# Folder: src/vs/ai-partner/server/tools

## Role
This directory contains the concrete Model Context Protocol (MCP) tools that give the AI Partner controlled access to the local development environment (file system, terminal, git, web, security scanners, etc.).

## Tool Breakdown (Examples)
- **File Tools**
  - `FileReadTool.ts`, `FileWriteTool.ts`, `FileAppendTool.ts`, `FileDeleteTool.ts` – Safe file read/write/append/delete operations within the workspace.
  - `MkdirTool.ts`, `MoveTool.ts`, `CopyTool.ts`, `ListDirTool.ts`, `StatTool.ts` – Filesystem utilities for creating directories, moving/copying files, listing directories, and inspecting file metadata.

- **Execution & Automation**
  - `TerminalExecutionTool.ts` – Runs shell commands (e.g. tests, builds) in a controlled way.
  - `GitAutomationTool.ts` – Prepares and runs Git commands with user confirmation where appropriate.

- **Analysis & Quality**
  - `SecurityVulnerabilityTool.ts` – Performs static analysis / security checks on code.
  - `LintTool.ts` – Runs linters over the workspace or specific files.

- **Knowledge & Utilities**
  - `WebSearchTool.ts` – Executes web searches when external access is allowed.
  - `MemoryTool.ts` – Stores/retrieves structured facts and preferences (e.g. under `.agent/memory.json`).
  - `GitignoreTool.ts` – Generates `.gitignore` files based on project type heuristics.
  - `BrowserOpenTool.ts` – Opens URLs in the user’s browser when needed.
  - `TaskCompletionTool.ts` – Special tool used in autonomous workflows to mark that a multi-step task has fully completed.

## AI Reading Guide
- To understand what actions the Orchestrator and agents can perform on the environment, scan the tool definitions in this folder.
- Each tool exposes a Zod-based input/output schema and a `handler` used by `MCPServer.ts`.
- When you need a new capability (e.g. interacting with another system), add a new tool here and register it in `MCPServer.ts`.
