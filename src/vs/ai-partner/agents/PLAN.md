# Plan: agents

## Objective
Implement and maintain the specialist agents that the Orchestrator delegates to via the local HTTP A2A server.

## Scope
- `OrchestratorAgent.ts` (central brain, referenced here for context only)
- Specialist agents such as `CodeAnalysisAgent`, `RefactoringSuggestionAgent`, `DocumentationGenerationAgent`, `ReadmeGenerationAgent`, `SecurityAnalysisAgent`, `CodeWatcherAgent`, `TaskDecompositionAgent`, `BrainstormAgent`, `ProgressTrackingAgent`, `ContextArchiveAgent`, `AILedLearningAgent`, `GitignoreGenerationAgent`, `CodeEditAgent`, `TestGenerationAgent`.

## Phases
1. **Agent Wiring & Contracts**
   - Ensure every agent implements `AgentExecutor` and works correctly with `a2a_server.ts` and `A2AMessage`.
2. **Behaviour & UX**
   - Validate that each agent’s behaviour matches the design in `PLAN.md` and produces useful, explainable output.
3. **Error Handling & Logging**
   - Add robust error handling and developer logs for all agents.
4. **Iteration & Refinement**
   - Refine prompts and workflows based on real usage.
