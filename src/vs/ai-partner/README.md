# AI Partner for VSCode

This project implements a sophisticated, multi-agent AI system that integrates deeply into VSCode as an extension. It is designed to act as an expert AI developer, assisting with various coding tasks through a conversational UI.

## Core Architecture

The system is built upon two primary communication protocols:

1.  **Agent-to-Agent (A2A) Protocol:** Used for internal communication between the various specialized agents within the VSCode extension. This allows for complex workflows where agents can delegate tasks and share information seamlessly.
2.  **Model-Context-Protocol (MCP):** Used for external communication between the extension (acting as an MCP client) and various tool servers. This allows the AI to perform actions like web searches, terminal commands, and more.

### System Components

-   **VSCode Extension (`extension.ts`):** The main entry point. It initializes all agents, the MCP server, and the webview UI.
-   **Agents (`/agents`):** A multi-agent system (MAS) where each agent has a specific role:
    -   `OrchestratorAgent`: The central coordinator that directs all workflows, handling messages from the UI and delegating tasks to other agents.
    -   `CodeAnalysisAgent`: Parses and understands code.
    -   `DocumentationGenerationAgent`: Creates documentation from code summaries.
    -   And others for context management, refactoring, and learning.
-   **MCP Server & Tools (`/server`):** A local server that exposes tools (e.g., `WebSearchTool`, `TerminalExecutionTool`) to the `OrchestratorAgent` via the MCP.
-   **UI (`/ui`):** A React-based webview interface that provides the main chat panel for user interaction.

## Getting Started

1.  **Install Dependencies:** Run `npm install` in both the root directory and the `src/vs/ai-partner/ui` directory.
2.  **Build the UI:** Navigate to `src/vs/ai-partner/ui` and run `npm run build` to compile the React application.
3.  **Run the Extension:** Open the project in VSCode and press `F5` to launch the Extension Development Host.
4.  **Activate the AI Partner:** In the new VSCode window, open the command palette (`Ctrl+Shift+P`) and run the `AI Partner: Start` command to open the chat view.
