# Folder: src/vs/ai-partner/interfaces

## Role
This directory defines the core TypeScript interfaces used across the AI Partner subsystem. These interfaces are the data contracts for A2A messages and higher-level code data structures.

## File Breakdown
- `A2AMessage.ts` – Defines the structure of Agent-to-Agent (A2A) messages exchanged between the Orchestrator and specialist agents. Used by both the extension and the A2A server.
- `CodeData.ts` – Defines code-related data structures (e.g. summaries, call graphs, or other code artifacts) that agents can share when reasoning about the workspace.

## AI Reading Guide
- Read `A2AMessage.ts` first to understand how messages sent via `dispatch` and the A2A server are structured.
- Then inspect `CodeData.ts` when you need to understand how code is represented and passed between analysis/refactoring/documentation agents.
- When adding new cross-cutting message types or data payloads, define or extend interfaces in this folder so they are shared consistently across agents and services.
