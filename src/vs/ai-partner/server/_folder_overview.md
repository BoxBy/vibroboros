# Folder: src/vs/ai-partner/server

## Role
This directory contains the in-process MCP (Model Context Protocol) server and related schemas that expose tools to the Orchestrator and other agents.

## File Breakdown
- `MCPServer.ts` – Creates a `Server` instance from `@modelcontextprotocol/sdk/server`, registers all tools, and exposes them via the MCP tools capability.
- `schemas/` (if present) – Defines request/response schemas (e.g. `ToolsListRequestSchema`, `ToolsCallRequestSchema`) used by the server when handling tool list/call requests.
- `tools/` – Houses the individual tool implementations (see its own `_folder_overview.md`).

## AI Reading Guide
- Start with `MCPServer.ts` to understand how tools are registered and how the server handles `listTools` and `callTool` requests.
- Then inspect the `tools/` subdirectory to see what capabilities the agents have (file I/O, terminal, git, web search, security, etc.).
- The MCP client wiring and routing logic live in `src/vs/ai-partner/extension.ts`; read that file to see how this server is connected to the rest of the system.
