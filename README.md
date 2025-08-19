# Vibroboros: An AI Coding Partner for VSCode

This project is a sophisticated, multi-agent AI system integrated into VSCode. It functions as an advanced, context-aware coding partner that proactively assists developers, improves code quality, and streamlines the development lifecycle.

## Core Architecture: Agent-to-Agent (A2A) Protocol

The system is built on the official Google Agent-to-Agent (A2A) communication protocol. This is a decentralized, multi-agent architecture where each agent acts as an independent, self-describing server.

- **Independent Agents**: Each agent (e.g., `DocGenAgent`, `RefactoringAgent`) runs as a separate Node.js/Express server on its own port.
- **Service Discovery**: Every agent server exposes an `AgentCard` at a `.well-known/agent-card.json` endpoint. This card describes the agent's identity, capabilities, and the specific skills it offers.
- **A2A Client**: The VSCode extension itself acts as a client. When a user invokes a command, the extension uses an `A2AClient` to send a standardized `Message` to the appropriate agent server.
- **Asynchronous Task-Based Communication**: Agents handle requests asynchronously. Upon receiving a request, the agent server immediately returns a `Task` object. The client then polls the `getTask` endpoint until the task is `completed`, `canceled`, or has an `error`.

This architecture allows for greater modularity, scalability, and adherence to open standards.

## Features

The Vibroboros partner currently supports the following features, each handled by a dedicated agent:

1.  **Generate Documentation**: Select a piece of code and this feature will generate a JSDoc comment for it.
    - **Agent**: `DocGenAgent` on port `41242`
    - **Command**: `Vibroboros: Generate Documentation`

2.  **Get Refactoring Suggestions**: Select code to receive suggestions for improving readability, performance, and best practices.
    - **Agent**: `RefactoringAgent` on port `41243`
    - **Command**: `Vibroboros: Get Refactoring Suggestions`

3.  **Summarize Code**: Select a block of code to get a high-level summary of its purpose.
    - **Agent**: `CodeAnalysisAgent` on port `41244`
    - **Command**: `Vibroboros: Summarize Code`

## Getting Started

### Prerequisites
- Visual Studio Code
- Node.js and npm

### Installation & Running
1.  Clone the repository.
2.  Install dependencies: `npm install`
3.  Open the project in VSCode.
4.  Press `F5` to launch the Extension Development Host.

### Configuration
Before using the AI-powered features, you must configure your API keys:

1.  Go to **File > Preferences > Settings** (or `Ctrl+,`).
2.  Search for "Vibroboros".
3.  Under **Vibroboros.llm: Api Keys**, add your OpenAI-compatible API keys.
4.  You can also configure the language model to use under **Vibroboros.llm: Model**.

## Usage

Once the extension is running, you can use its features via the Command Palette (`Ctrl+Shift+P`):

1.  Select a piece of code in the editor.
2.  Open the Command Palette.
3.  Type `Vibroboros` to see the list of available commands.
4.  Choose a command, such as `Vibroboros: Generate Documentation`.
5.  The extension will show a progress notification, and the result will be inserted into the editor or shown in a new tab/notification.

## Project Structure

- `src/vs/ai-partner/`
  - `extension.ts`: The main activation script for the VSCode extension. It launches the agent servers and registers the UI commands.
  - `a2a_client.ts`: A client for communicating with A2A-compliant agent servers.
  - `a2a_server.ts`: Contains the core interfaces and building blocks for creating A2A servers (`AgentExecutor`, `InMemoryTaskStore`).
  - `core_data_structures.ts`: Defines all TypeScript interfaces for the A2A protocol (`AgentCard`, `Task`, `Message`, etc.).
  - `agents/`: Contains the implementation for each independent agent.
    - `*_executor.ts`: The core logic for an agent skill.
    - `*_server.ts`: The Express server that hosts an agent and its executor.
  - `llm_service.ts`: A service that manages communication with the LLM, including API key rotation.
  - `config_service.ts`: A service that reads the extension's configuration from VSCode settings.
  - `main_view_provider.ts`: Manages the sidebar webview UI.
  - `media/`: Contains the HTML, CSS, and JS for the sidebar.

## Future Work

- Implement streaming (`sendMessageStream`) for real-time updates instead of polling.
- Enhance the sidebar UI to dynamically discover and display agent skills from their `AgentCard`s.
- Implement a more robust `TaskStore` for persistence.
