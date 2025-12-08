# Plan: server

## Objective
Provide a robust in-process Model Context Protocol (MCP) server that exposes a rich set of tools to the Orchestrator and other agents, using the official Model Context Protocol (MCP) SDK and in-memory transport.

## Scope
- `MCPServer.ts`
- `schemas/` (MCP request/response schemas)
- `server/tools/*` (all MCP tools)

## Phases
1. **Tool Coverage**
   - Ensure all core environment actions (file I/O, terminal, git, web search, security, memory, linting, browser open, task completion) are implemented as tools.
2. **Reliability & Shape**
   - Keep tool input/output contracts aligned with Zod schemas and the MCP SDK expectations.
3. **Performance & Safety**
   - Enforce workspace boundaries and defensive checks in all tools.
4. **Observability**
   - Add logging where necessary to debug tool failures and latency.
