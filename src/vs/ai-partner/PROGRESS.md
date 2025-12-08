# Progress: src/vs/ai-partner

## Status
In Progress – core wiring is implemented; advanced context management, long‑term memory, and tests are partially implemented.

## Completed
- AI Partner `extension.ts` initializes services, starts MCPServer, starts A2A server, and constructs `OrchestratorAgent`.
- `AIPartnerViewProvider` connects the React UI to the Orchestrator.
- `a2a_server.ts` hosts specialist agents and normalizes `message.parts` and A2A data payloads.

## In Progress
- Correlation-based idempotency and dynamic post-actions in `OrchestratorAgent` are implemented but still evolving.
- Context management and archive/search flows are scaffolded but not fully wired into all workflows.

## Next Steps
- Harden error handling around MCP/A2A startup and dispatch.
- Integrate intelligent context pruning and `ContextArchiveAgent` into real chat flows.
- Add realistic unit and integration tests for end-to-end scenarios.
