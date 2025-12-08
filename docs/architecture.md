# Viper Project Architecture

## Introduction

This document provides a comprehensive overview of the Viper project architecture. It is generated from the `_folder_overview.md` files located throughout the codebase and serves as a central guide for understanding the roles and responsibilities of each component.

---

## Project Root

The root of the project contains configuration files, documentation, and the main source code directory.

### Folder: .github

#### Role
This directory contains configuration and templates for GitHub-specific features, such as issue and pull request templates.

#### File Breakdown
- **`PULL_REQUEST_TEMPLATE.md`**: A template that is automatically populated in the description of a new pull request. It guides contributors to provide necessary information.
- **`ISSUE_TEMPLATE/`**: A directory containing templates for different types of issues (e.g., `bug_report.md`, `feature_request.md`).

#### AI Reading Guide
- This folder is for repository management and contribution guidelines. It does not contain application source code.

### Folder: .vscode

#### Role
This directory contains workspace-specific settings for Visual Studio Code. These settings help ensure a consistent development environment for all contributors.

#### File Breakdown
- **`launch.json`**: Defines debugging configurations, allowing you to run and debug the extension directly from VS Code.
- **`tasks.json`**: Defines custom tasks that can be run from the command palette, such as build, test, or lint tasks.
- **`settings.json`**: Contains workspace-specific editor settings, such as formatting preferences, linter rules, and file associations.
- **`extensions.json`**: Recommends other VS Code extensions that are useful for developing this project (e.g., ESLint, Prettier).

#### AI Reading Guide
- To run and debug the extension, use the configurations in `launch.json`.
- To understand the build process, check the tasks in `tasks.json` and the root `package.json` scripts.

### Folder: docs

#### Role
This directory contains high-level documentation about the project's architecture, philosophy, and design decisions.

#### File Breakdown
- **`architecture.md`**: Describes the overall architecture of the system, how the different components (agents, services, UI) interact, and the communication protocols used.
- **`philosophy.md`**: Explains the core principles and goals behind the project's design.

#### AI Reading Guide
- **To get a high-level understanding of the project, read the files in this directory first.**
- `architecture.md` is particularly important for understanding the system as a whole before diving into the source code.

### Folder: media

#### Role
This directory contains global media assets for the project, such as the main logo.

#### File Breakdown
- **`logo.svg`**: The main logo for the Viper project.

#### AI Reading Guide
- This folder is for top-level branding and media assets. UI-specific assets are located in `src/vs/ai-partner/media/` or `src/vs/ai-partner/ui/`.

---

## Source Code (`src`)

### Folder: src

#### Role
This is the main source code directory for the "viper" VS Code extension. It contains the core logic and entry points for the extension.

#### File Breakdown
- **`extension.ts`**: The primary entry point for the VS Code extension. It handles activation, command registration, and initialization of core components.
- **`test/`**: Contains tests for the extension.
- **`vs/`**: Contains VS Code specific UI and integration components, particularly the "ai-partner" feature.

#### AI Reading Guide
- To understand the extension's startup and overall structure, start with `extension.ts`.
- For the core AI-related features, dive into the `vs/ai-partner/` directory.
- For testing logic, look inside `test/`.

### Folder: src/test

#### Role
This directory contains the automated tests for the extension, ensuring code quality and correctness. It uses VS Code's testing framework.

#### File Breakdown
- **`extension.test.ts`**: Contains tests specifically for the main `extension.ts` file. This likely includes tests for extension activation, command registration, and basic functionality.

#### AI Reading Guide
- Read `extension.test.ts` to understand how the core extension functionality is tested.
- To add new tests for the main extension, modify or add files in this directory.
- For tests related to specific features like the AI Partner, look for corresponding test folders, such as `src/vs/ai-partner/testing/`.

### Folder: src/types

#### Role
This directory holds global TypeScript type definitions (`.d.ts` files) and shims. These files help the TypeScript compiler understand the shape of objects or modules that don't have explicit types, such as external libraries or environment-specific features.

#### File Breakdown
- **`shims.d.ts`**: Provides type definitions for modules or global variables that are not automatically recognized by TypeScript. This could include shims for browser APIs, Node.js modules, or custom file types.

#### AI Reading Guide
- Check this folder if you encounter TypeScript errors related to missing type definitions for global or imported modules.
- Add new `.d.ts` files here for any new broad, project-wide type declarations.

---

## AI Partner Feature (`src/vs`)

### Folder: src/vs

#### Role
This directory seems to be a namespace or container for components that are tightly integrated with the Visual Studio Code environment itself.

#### File Breakdown
- **`ai-partner/`**: The main subdirectory, containing the core "AI Partner" feature.

#### AI Reading Guide
- The primary functionality is located within the `ai-partner/` subdirectory. This folder serves as an organizational layer.

### Folder: src/vs/ai-partner

#### Role
This is the central directory for the "AI Partner" feature, which orchestrates the AI-driven development experience within VS Code, including UI, communication protocols, agent management, and various services.

#### Structure Overview
- **UI/View Providers**: `AIPartnerViewProvider.ts` manages the webview panels displayed to the user in the VS Code sidebar and connects them to the Orchestrator.
- **Communication**: `a2a_server.ts` hosts specialist agents over HTTP using the `@a2a-js/sdk`, and `MCPServer.ts` (under `server/`) exposes local tools via the Model Context Protocol. The extension entrypoint wires these together using the MCP SDK's in-process transports.
- **Core Services**: `AuthService`, `ConfigService`, `LLMService`, `DeveloperLogService` and other services under `services/` provide configuration, authentication, logging, and LLM communication.
- **Agents**: The `agents/` subdirectory contains `OrchestratorAgent.ts` (the master agent) and multiple specialist agents (analysis, refactoring, documentation, security, watcher, context archive, etc.).
- **Data Structures**: The `interfaces/` subdirectory defines the primary data models and message formats used throughout the system (such as A2A messages and code data structures).
- **Entry Point**: `extension.ts` in this folder is the entry point for the AI Partner subsystem itself, initialized by the root `src/extension.ts`.

#### AI Reading Guide
- To understand how the UI is created and managed, look at `AIPartnerViewProvider.ts` and the `ui/` folder.
- To understand how different components communicate, study `mcp.ts` and the `interfaces/` folder.
- To see the different AI capabilities, explore the files in the `agents/` subdirectory.
- For the main business logic of the AI partner, start with `agent.ts` and `extension.ts`.

### Folder: src/vs/ai-partner/agents

#### Role
This directory contains the definitions for various specialized AI agents. Each agent is designed to handle a specific, well-defined task within the software development lifecycle. The system follows a clear pattern where an `*Agent.ts` file defines the agent's logic, and corresponding `*_executor.ts` and `*_server.ts` files might handle its execution and communication.

#### Agent Breakdown
- **`OrchestratorAgent.ts`**: The master agent. It likely receives user requests, breaks them down into smaller tasks, and delegates them to the appropriate specialized agents. **This is a critical file to understand the overall workflow.**
- **`CodeAnalysisAgent.ts`**: Responsible for analyzing source code to understand its structure, identify patterns, and gather context.
- **`DocumentationGenerationAgent.ts` / `ReadmeGenerationAgent.ts`**: Agents that automatically generate documentation for code, classes, or the entire project.
- **`RefactoringSuggestionAgent.ts`**: Analyzes code and suggests potential refactorings to improve quality.
- **`TestGenerationAgent.ts`**: Automatically generates unit or integration tests for the source code.
- **`CodeExecutionAgent.ts`**: An agent that can execute code, possibly in a sandboxed environment.
- **`ContextManagementAgent.ts`**: Manages the context provided to the LLM, including file contents, user history, and other relevant information.
- **`ui_agent.ts`**: An agent that might interact with or control the user interface.

#### AI Reading Guide
- **Start with `OrchestratorAgent.ts`** to understand how user requests are processed and delegated.
- To understand a specific capability (e.g., test generation), read the corresponding agent file (e.g., `TestGenerationAgent.ts`).
- The `*_executor.ts` and `*_server.ts` files likely handle the low-level details of running the agent's logic, possibly in a separate process.

### Folder: src/vs/ai-partner/interfaces

#### Role
This directory defines the TypeScript interfaces for the data structures and message payloads used for communication throughout the AI Partner system. It acts as the "data contract" between different components, such as agents, services, and UI.

#### Interface Breakdown
- **`A2AMessage.ts`**: Defines the structure for Agent-to-Agent (A2A) communication. This is used when agents need to collaborate or exchange information directly.
- **`CodeData.ts`**: Defines the data structure for representing code artifacts, such as files, classes, functions, and their associated metadata. This is used by analysis-oriented agents and passed to other agents.

#### AI Reading Guide
- Before attempting to send or receive messages between components, consult the interfaces in this directory to ensure the data is correctly formatted.
- If you need to add a new type of message or data payload, define its interface here first.
  Understanding `A2AMessage.ts` is crucial for understanding the main A2A communication flow between agents.

### Folder: src/vs/ai-partner/services

#### Role
This directory contains high-level, shared services used by various parts of the AI Partner feature. These services encapsulate business logic and provide a clean API for common functionalities.

#### Service Breakdown
- **`LLMService.ts`**: A crucial service that encapsulates all interactions with the Large Language Model (LLM). It handles API requests, response parsing, and error handling. It may also manage different LLM configurations or providers.
- **`DeveloperLogService.ts`**: A service for logging events, actions, and decisions made by the AI agents. This is vital for debugging, transparency, and allowing the user to understand the AI's thought process.

#### AI Reading Guide
- To understand how the extension communicates with the AI model, `LLMService.ts` is the most important file.
- To see what information is being logged about the AI's activity, inspect `DeveloperLogService.ts`.

### Folder: src/vs/ai-partner/server

#### Role
This directory contains the backend or server-side logic that might run in a separate process from the main extension host. It's responsible for handling heavy computations, managing persistent state, or providing services that need to run independently.

#### File Breakdown
- **`MCPServer.ts`**: The implementation of the MCP server. It registers available tools and connects to the in-process transports configured by the extension entrypoint. This is a key file for understanding the backend architecture.
- **`tools/`**: A subdirectory containing tools that the server-side process can execute, such as file system operations or running terminal commands.

#### AI Reading Guide
- Start with `MCPServer.ts` to understand the core of the backend process.
- Explore the `tools/` directory to see what capabilities the server has.
- This server communicates with the main extension via the in-process MCP client configured in `src/vs/ai-partner/extension.ts`.

### Folder: src/vs/ai-partner/server/tools

#### Role
This directory defines a collection of tools that can be executed by server-side agents or services. These tools provide access to the local development environment, allowing the AI to perform actions like reading/writing files, running tests, and using Git. They are analogous to the tools provided to an LLM agent.

#### Tool Breakdown
- **`FileReadTool.ts` / `FileWriteTool.ts`**: Tools for reading from and writing to the file system, with safety checks to stay within the workspace.
- **`TerminalExecutionTool.ts`**: A tool that allows the AI to execute shell commands for tasks like running tests or builds.
- **`GitAutomationTool.ts`**: Provides an interface for interacting with the Git repository.
- **`SecurityVulnerabilityTool.ts`**: Scans code for common, pattern-based security vulnerabilities.
- **`WebSearchTool.ts`**: Performs web searches to gather external information when allowed.
- **`MemoryTool.ts`**: Allows the AI to store facts and user preferences in a persistent JSON file under `.agent/memory.json`.
- **`GitignoreTool.ts`**: Generates `.gitignore` files based on detected project types using an external API.
- **`TaskCompletionTool.ts`**: A special tool used in autonomous workflows to signal that a multi-step task has fully completed.

#### AI Reading Guide
- These files define the "actions" the AI can take. Understanding their capabilities is key to understanding how the agent accomplishes complex tasks.
- When asked to perform a task involving file I/O, git, or shell commands, the `OrchestratorAgent` will likely invoke one of these tools via the server.

### Folder: src/vs/ai-partner/tools

#### Role
This directory contains client-side tools or utilities that are used within the main VS Code extension process.

#### File Breakdown
- **`TaskCompletionTool.ts`**: The purpose of this tool is not immediately obvious from its name. It might be a utility for marking tasks as complete, or it could be a tool provided to an agent that relates to task management.

#### AI Reading Guide
- Analyze `TaskCompletionTool.ts` to understand its specific function. It seems to be a tool available to agents, so understanding what it does is key to understanding the agent's capabilities.

### Folder: src/vs/ai-partner/testing

#### Role
This directory holds tests specifically for the AI Partner feature. It includes both unit tests for individual components and integration tests for verifying the interactions between them.

#### File Breakdown
- **`UnitTests.test.ts`**: Contains unit tests for specific functions and classes within the AI Partner codebase. This is for testing components in isolation.
- **`IntegrationTests.test.ts`**: Contains integration tests that verify the collaboration between multiple components, such as the communication between an agent and a service, or the full flow from a UI interaction to an agent action.

#### AI Reading Guide
- Read these test files to understand the expected behavior of the AI Partner's components and how they are intended to be used.
- Before making changes to any component, run the tests in this folder to ensure you haven't introduced a regression.
- Add new tests here when developing new features for the AI Partner.

---

## User Interface (`src/vs/ai-partner/ui`)

### Folder: src/vs/ai-partner/ui

#### Role
This directory contains the source code for the modern, webview-based user interface, which is built using React (or a similar framework like Preact/Solid, indicated by `.tsx` files and `vite.config.ts`).

#### Structure Overview
- **Components (`.tsx`)**: The directory contains various React components that make up the UI, such as `ChatView.tsx`, `InputArea.tsx`, `MessageList.tsx`, `PlanView.tsx`, etc.
- **Entry Point**: `index.tsx` is the main entry point for the React application that runs inside the webview.
- **Build Configuration**: `vite.config.ts`, `package.json`, and `tsconfig.json` are used to build and bundle the UI code into static assets that can be loaded by the webview.
- **Styling**: `styles.css` contains the styles for the React components.
- **Services**: The `services/` subdirectory contains UI-specific helper functions, especially for communicating with the VS Code extension host.

#### AI Reading Guide
- To understand the structure and appearance of the AI Partner's chat interface, start with `MainView.tsx` and `ChatView.tsx`.
- To modify how the user inputs messages, see `InputArea.tsx`.
- `services/vscode.ts` is critical for understanding how the UI sends messages to and receives messages from the extension backend.
- This is a standard React/Vite project. To make changes, you may need to run `npm install` in this directory and then run a build command defined in `package.json`.

### Folder: src/vs/ai-partner/ui/services

#### Role
This directory provides services specifically for the React-based UI. These services abstract away the complexities of interacting with the underlying VS Code environment from within the webview.

#### File Breakdown
- **`vscode.ts`**: This is a crucial utility file. It wraps the `acquireVsCodeApi()` function and provides strongly-typed methods for sending messages from the webview (React UI) to the extension host (backend) and for handling messages received from the host. It acts as the primary bridge between the UI and the rest of the extension.

#### AI Reading Guide
- **This file is essential for understanding UI-backend communication.**
- To add a new message type from the UI to the backend, you should add a new method in this file.
- When a UI component needs to send data to or request data from the extension, it should use the functions provided by `vscode.ts`.

### Folder: src/vs/ai-partner/media

#### Role
This directory stores static assets for the AI Partner's webview UI. This includes stylesheets (CSS), client-side scripts (JavaScript), and images (SVG).

#### File Breakdown
- **`main.css`**: The primary stylesheet for the webview UI. It defines the look and feel of the chat interface, buttons, and other visual elements.
- **`main.js`**: Contains client-side JavaScript logic for the webview. This script handles user interactions, communication with the extension backend (via the VS Code API), and dynamic UI updates.
- **`logo.svg`**: The logo image for the AI Partner, displayed in the UI.

#### AI Reading Guide
- To change the visual appearance of the UI, modify `main.css`.
- For client-side interactivity and communication logic within the webview, analyze and edit `main.js`.
- Note: The modern UI seems to be built with React in the `ui/` directory, which may supersede the direct use of `main.js` and `main.css` for newer views. Check `AIPartnerViewProvider.ts` to see how these assets are loaded.