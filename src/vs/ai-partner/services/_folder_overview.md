# Folder: src/vs/ai-partner/services

## Role
This directory contains shared services used by multiple parts of the AI Partner subsystem. Services encapsulate cross-cutting concerns such as LLM access, logging, configuration, and streaming.

## Service Breakdown
- `LLMService.ts` – Central service for talking to external LLM providers (OpenAI-compatible, Ollama, Anthropic, xAI, Google, Groq, OpenRouter). Handles endpoint resolution, streaming, structured outputs, error handling, and basic usage tracking.
- `DeveloperLogService.ts` – Aggregates developer-facing logs from agents and services (e.g. Orchestrator routing decisions, A2A dispatch notes) for transparency and debugging.
- `TerminalStreamService.ts` – Manages streaming output from long-running terminal commands so the UI can show incremental results.

(Other services such as configuration and authentication live in neighbouring files like `ConfigService.ts` and `AuthService.ts` outside this folder but are wired together in `extension.ts`.)

## AI Reading Guide
- To understand how the extension talks to the LLMs, start with `LLMService.ts`.
- To see how internal decisions and events are surfaced to the user, read `DeveloperLogService.ts`.
- For long-running terminal operations and their UI integration, inspect `TerminalStreamService.ts` and its usages.
