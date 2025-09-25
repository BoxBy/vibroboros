# Folder: src/vs/ai-partner/services

## Role
This directory contains high-level, shared services used by various parts of the AI Partner feature. These services encapsulate business logic and provide a clean API for common functionalities.

## Service Breakdown
- **`LLMService.ts`**: A crucial service that encapsulates all interactions with the Large Language Model (LLM). It handles API requests, response parsing, and error handling. It may also manage different LLM configurations or providers.
- **`DeveloperLogService.ts`**: A service for logging events, actions, and decisions made by the AI agents. This is vital for debugging, transparency, and allowing the user to understand the AI's thought process.

## AI Reading Guide
- To understand how the extension communicates with the AI model, `LLMService.ts` is the most important file.
- To see what information is being logged about the AI's activity, inspect `DeveloperLogService.ts`.
