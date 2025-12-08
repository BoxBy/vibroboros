# Folder: src/vs

## Role
This directory is a namespace for features that are tightly integrated with the VS Code host APIs. Today it primarily contains the `ai-partner` subsystem, which implements the multi‑agent AI coding partner.

## File Breakdown
- **`ai-partner/`** – The main subdirectory, containing the entire AI Partner feature set (extension activation glue, Orchestrator agent, Model Context Protocol (MCP) server and tools, shared services, UI, and tests).

## AI Reading Guide
- Start from `src/extension.ts` to see how the root extension delegates to `src/vs/ai-partner/extension.ts`.
- Then read `src/vs/ai-partner/_folder_overview.md` and its subfolders to understand how the AI Partner is structured.
