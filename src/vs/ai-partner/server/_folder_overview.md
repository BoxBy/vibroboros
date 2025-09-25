# Folder: src/vs/ai-partner/server

## Role
This directory contains the backend or server-side logic that might run in a separate process from the main extension host. It's responsible for handling heavy computations, managing persistent state, or providing services that need to run independently.

## File Breakdown
- **`MCPServer.ts`**: The implementation of the "Master Control Program" (MCP) server. It likely listens for connections from MCP clients (e.g., from the main extension or agents) and orchestrates communication and tasks. This is a key file for understanding the backend architecture.
- **`tools/`**: A subdirectory containing tools that the server-side process can execute, such as file system operations or running terminal commands.

## AI Reading Guide
- Start with `MCPServer.ts` to understand the core of the backend process.
- Explore the `tools/` directory to see what capabilities the server has.
- This server likely communicates with the main extension via `mcp_client.ts`.
