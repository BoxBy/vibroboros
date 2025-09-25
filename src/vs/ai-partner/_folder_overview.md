# Folder: src/vs/ai-partner

## Role
This is the central directory for the "AI Partner" feature, which appears to be the core product. It orchestrates the entire AI-driven development experience within VS Code, including UI, communication protocols, agent management, and various services.

## Structure Overview
- **UI/View Providers**: `AIPartnerViewProvider.ts`, `main_view_provider.ts` manage the webview panels displayed to the user in the VS Code sidebar or main editor area.
- **Communication**: `mcp.ts` (Master Control Program?), `mcp_client.ts`, `a2a_client.ts` (Agent-to-Agent?), `a2a_server.ts` define the communication protocols and clients for different parts of the system to talk to each other.
- **Core Services**: `auth_service.ts`, `config_service.ts`, `llm_service.ts`, `mcp_service.ts` provide fundamental services like authentication, configuration management, and interaction with Large Language Models.
- **Agents**: The `agents/` subdirectory contains specialized AI agents responsible for specific tasks (e.g., code analysis, documentation generation).
- **Data Structures**: `core_data_structures.ts` and the `interfaces/` subdirectory define the primary data models and message formats used throughout the system.
- **Entry Point**: `extension.ts` in this folder likely serves as the entry point for the AI Partner feature itself, initialized by the root `extension.ts`.

## AI Reading Guide
- To understand how the UI is created and managed, look at `AIPartnerViewProvider.ts` and the `ui/` folder.
- To understand how different components communicate, study `mcp.ts` and the `interfaces/` folder.
- To see the different AI capabilities, explore the files in the `agents/` subdirectory.
- For the main business logic of the AI partner, start with `agent.ts` and `extension.ts`.
