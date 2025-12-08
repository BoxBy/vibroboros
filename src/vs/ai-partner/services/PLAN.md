# Plan: services

## Objective
Provide reusable services for LLM access, logging, streaming, and related cross-cutting concerns.

## Scope
- `LLMService.ts`
- `DeveloperLogService.ts`
- `TerminalStreamService.ts`

## Phases
1. **Stabilize LLM Access**
   - Keep provider handling, streaming, and structured outputs robust.
2. **Improve Observability**
   - Use `DeveloperLogService` to surface key decisions and errors.
3. **Streaming & UX**
   - Ensure `TerminalStreamService` and LLM streaming integrate smoothly with the UI.
