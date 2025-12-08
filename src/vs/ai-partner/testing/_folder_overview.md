# Folder: src/vs/ai-partner/testing

## Role
This directory is intended to hold tests specific to the AI Partner subsystem (agents, services, MCP tools, and UI integration flows).

## File Breakdown (typical)
- `UnitTests.test.ts` – Unit tests for individual components (e.g. services, simple agent helpers, or tools).
- `IntegrationTests.test.ts` – Integration tests that exercise full workflows such as UI → Orchestrator → MCP/A2A → UI.

(Depending on the current branch, these files may still be scaffolds that need to be populated.)

## AI Reading Guide
- Before making large architectural changes to agents, tools, or services, consult this folder to see what behaviour is already covered by tests.
- When adding new core features, add or update tests here to validate end‑to‑end flows (especially around plan execution, diff application, and tool calls).
