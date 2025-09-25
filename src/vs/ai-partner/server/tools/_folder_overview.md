# Folder: src/vs/ai-partner/server/tools

## Role
This directory defines a collection of tools that can be executed by server-side agents or services. These tools provide access to the local development environment, allowing the AI to perform actions like reading/writing files, running tests, and using Git. They are analogous to the tools provided to an LLM agent.

## Tool Breakdown
- **`FileReadTool.ts` / `FileWriteTool.ts`**: Tools for reading from and writing to the file system.
- **`TerminalExecutionTool.ts`**: A powerful tool that allows the AI to execute arbitrary shell commands. This is used for tasks like installing dependencies, running builds, or executing scripts.
- **`GitAutomationTool.ts`**: Provides an interface for interacting with the Git repository, enabling actions like staging, committing, and pushing changes.
- **`AutomatedTestAndFixTool.ts`**: A high-level tool that likely combines running tests, analyzing the output, and attempting to automatically fix them.
- **`SecurityVulnerabilityTool.ts`**: A tool for scanning code or dependencies for known security vulnerabilities.
- **`WebSearchTool.ts`**: A tool to perform web searches to gather information.

## AI Reading Guide
- These files define the "actions" the AI can take. Understanding their capabilities is key to understanding how the agent accomplishes complex tasks.
- When asked to perform a task involving file I/O, git, or shell commands, the `OrchestratorAgent` will likely invoke one of these tools via the server.
