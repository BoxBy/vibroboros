# Viper

<p align="center">
  <img src="media/logo.svg" width="400">
</p>

<div align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL%20v3-blue.svg" alt="License: AGPL v3"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=Viper.viper"><img src="https://img.shields.io/visual-studio-marketplace/v/Viper.viper.svg?color=blue&label=VS%20Marketplace" alt="VS Marketplace"></a>
</div>

## Introduction

Viper is a sophisticated multi-agent AI coding partner integrated into VS Code. It enhances developer productivity, improves code quality, and streamlines the development lifecycle through the collaboration of specialized, distributed agents. Each agent is an expert in a specific task and communicates with others via a true Agent-to-Agent (A2A) protocol.

## Core Features

*   **True Multi-Agent System (MAS)**: A team of specialized AI agents that run as independent services and collaborate to handle complex development tasks.
*   **A2A Communication**: All inter-agent communication is handled via a standard, HTTP-based Agent-to-Agent protocol, making the system modular and extensible.
*   **Dynamic Task Planning**: The `OrchestratorAgent` dynamically creates execution plans based on user goals and delegates tasks to the appropriate specialist agents.
*   **Proactive & Background Tasks**: Agents like `CodeWatcherAgent` and `SecurityAnalysisAgent` work in the background to find issues and keep your project indexed.
*   **Security & Automation Settings**: Highly granular controls for `Strict Mode`, `Review Policy`, `Terminal Auto-Execution`, and `File Access Policy` to ensure safe autonomous operations.
*   **Extensible Tooling**: The system uses the Model Context Protocol (MCP) standard, allowing agents to use tools like file I/O, terminal execution, and web search.

## Architecture

Viper is built on a true Agent-to-Agent (A2A) architecture. All agents are hosted as independent services by a central `a2a_server`. The `OrchestratorAgent` acts as the main entry point for user requests, but all agents communicate with each other as peers using `A2AClient`.

For a detailed explanation of the architecture, please see the [Project Blueprint](./PLAN.md).

To understand the core principles behind the project, please see the [Philosophy Documentation](./docs/philosophy.md).

## Getting Started

1.  **Install the Extension**: Find "Viper" in the VS Code Marketplace and install it.
2.  **Configure the Extension**:
    *   Open VS Code settings (`Ctrl+,`).
    *   Search for "Viper".
    *   Enter your API key and endpoint for the LLM service.
3.  **Start Chatting**: Open the Viper sidebar to start interacting with your AI partner.

## Documentation

Detailed documentation about the project's architecture and philosophy can be found in the `docs` folder:

*   **[Project Blueprint](./PLAN.md)** (The most up-to-date architecture document)
*   **[Philosophy](./docs/philosophy.md)**

## Contributing

Contributions are welcome!

## License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](./LICENSE) file for details.