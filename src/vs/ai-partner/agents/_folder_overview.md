# Folder: src/vs/ai-partner/agents

## Role
This directory contains the definitions for various specialized AI agents. Each agent is designed to handle a specific, well-defined task within the software development lifecycle. The system follows a clear pattern where an `*Agent.ts` file defines the agent's logic, and corresponding `*_executor.ts` and `*_server.ts` files might handle its execution and communication.

## Agent Breakdown
- **`OrchestratorAgent.ts`**: The master agent. It likely receives user requests, breaks them down into smaller tasks, and delegates them to the appropriate specialized agents. **This is a critical file to understand the overall workflow.**
- **`CodeAnalysisAgent.ts`**: Responsible for analyzing source code to understand its structure, identify patterns, and gather context.
- **`DocumentationGenerationAgent.ts` / `ReadmeGenerationAgent.ts`**: Agents that automatically generate documentation for code, classes, or the entire project.
- **`RefactoringSuggestionAgent.ts`**: Analyzes code and suggests potential refactorings to improve quality.
- **`TestGenerationAgent.ts`**: Automatically generates unit or integration tests for the source code.
- **`CodeExecutionAgent.ts`**: An agent that can execute code, possibly in a sandboxed environment.
- **`ContextManagementAgent.ts`**: Manages the context provided to the LLM, including file contents, user history, and other relevant information.
- **`ui_agent.ts`**: An agent that might interact with or control the user interface.

## AI Reading Guide
- **Start with `OrchestratorAgent.ts`** to understand how user requests are processed and delegated.
- To understand a specific capability (e.g., test generation), read the corresponding agent file (e.g., `TestGenerationAgent.ts`).
- The `*_executor.ts` and `*_server.ts` files likely handle the low-level details of running the agent's logic, possibly in a separate process.
