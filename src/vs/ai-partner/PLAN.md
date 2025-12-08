# Plan: src/vs/ai-partner

## Objective
Stabilize and evolve the AI Partner subsystem that wires VS Code activation into the Orchestrator, Model Context Protocol (MCP) tool server, A2A server, shared services, and React UI.

## Scope
- `extension.ts` (AI Partner entrypoint)
- `AIPartnerViewProvider.ts` (webview bridge)
- `a2a_server.ts` (local HTTP A2A server)
- `server/`, `services/`, `agents/`, `interfaces/`, `ui/`, `testing/`

## Phases
1. **Foundation & Wiring**
   - Keep extension → AI Partner → Model Context Protocol (MCP) → A2A wiring simple and robust.
   - Ensure Orchestrator is the only entrypoint for user requests.
2. **Context Management & Memory**
   - Finish correlation-based idempotency and intelligent context management.
   - Integrate `ContextArchiveAgent` for long-term memory.
3. **UI & UX**
   - Provide clear plans, diffs, status updates, and streaming responses in the webview.
4. **Testing & Hardening**
   - Add unit/integration tests under `testing/` and `src/test` for critical flows.
