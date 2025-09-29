# Vibroboros

<p align="center">
  <img src="media/logo.svg" width="400">
</p>

<div align="center">
  <a href="LICENSE.txt"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=Vibroboros.vibroboros"><img src="https://img.shields.io/visual-studio-marketplace/v/Vibroboros.vibroboros.svg?color=blue&label=VS%20Marketplace" alt="VS Marketplace"></a>
</div>

## Introduction

Vibroboros is a sophisticated multi-agent AI coding partner integrated into VS Code. It enhances developer productivity, improves code quality, and streamlines the development lifecycle through the collaboration of specialized, distributed agents. Each agent is an expert in a specific task (e.g., code analysis, refactoring, documentation generation) and is orchestrated by a central agent.

## Core Features

*   **Multi-Agent System (MAS)**: A team of specialized AI agents that collaborate to handle complex development tasks.
*   **Intelligent Context Management**: Automatically manages conversation history to stay within token limits, including summarization and long-term memory.
*   **Proactive & Background Tasks**: Agents like `CodeWatcherAgent` and `SecurityAnalysisAgent` work in the background to find issues and keep your project indexed.
*   **Interactive UI**: A modern React-based UI provides a seamless chat experience, session management, and interactive controls for AI-powered actions.
*   **Extensible Tooling**: The system uses a "Model-Capability-Provider" (MCP) protocol, allowing agents to use tools like file I/O, terminal execution, and web search.

## Architecture

Vibroboros is built on a multi-agent architecture where each agent has a specific role. The `OrchestratorAgent` acts as the central hub, delegating tasks to other agents. Communication is handled internally via an Agent-to-Agent (A2A) dispatch system.

For a detailed explanation of the architecture, please see the [Architecture Documentation](./docs/architecture.md).

To understand the core principles behind the project, please see the [Philosophy Documentation](./docs/philosophy.md).

## Getting Started

1.  **Install the Extension**: Find "Vibroboros" in the VS Code Marketplace and install it.
2.  **Configure the Extension**:
    *   Open VS Code settings (`Ctrl+,`).
    *   Search for "Vibroboros".
    *   Enter your API key and endpoint for the LLM service.
3.  **Start Chatting**: Open the Vibroboros sidebar to start interacting with your AI partner.

## Documentation

Detailed documentation about the project's architecture and philosophy can be found in the `docs` folder:

*   **[Architecture](./docs/architecture.md)**
*   **[Philosophy](./docs/philosophy.md)**

## Contributing

Contributions are welcome! Please see the [Contributing Guidelines](./CONTRIBUTING.md) for more details on how to get started.

## License

This project is licensed under the MIT License - see the [LICENSE.txt](./LICENSE.txt) file for details.
