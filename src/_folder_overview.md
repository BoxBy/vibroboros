# Folder: src

## Role
This is the main source code directory for the "vibroboros" VS Code extension. It contains the core logic and entry points for the extension.

## File Breakdown
- **`extension.ts`**: The primary entry point for the VS Code extension. It handles activation, command registration, and initialization of core components.
- **`agent.ts`**: Defines a core agent or worker process for the extension, likely handling background tasks or communication.
- **`test/`**: Contains tests for the extension.
- **`types/`**: Holds TypeScript type definitions and shims.
- **`vs/`**: Contains VS Code specific UI and integration components, particularly the "ai-partner" feature.

## AI Reading Guide
- To understand the extension's startup and overall structure, start with `extension.ts`.
- For the core AI-related features, dive into the `vs/ai-partner/` directory.
- For testing logic, look inside `test/`.
