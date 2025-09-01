# Vibroborus Refactoring Plan

## Objective
Refactor the vibroborus project's architecture to establish a clear separation between the UI (Webview) and the Agent (background logic), mirroring the robust and scalable architecture of geminicodeassist.

## Core Principles to Adopt
1.  **Separation of Concerns:** UI (Webview) for rendering and user input only. Core logic handled by a background agent.
2.  **Message-Based Communication:** Asynchronous communication between UI and Agent via `vscode.postMessage()`.
3.  **Centralized Orchestration:** A main agent (OrchestratorAgent) to receive, interpret, and delegate tasks.

## Actionable Instructions

### 1. Decouple UI and Agent Logic
-   **File:** `src/vs/ai-partner/AIPartnerViewProvider.ts`
-   **Tasks:**
    -   Separate UI event handling from business logic.
    -   `AIPartnerViewProvider.ts` will only create the webview and forward user events to an "Agent Host" in `extension.ts`.
    -   All UI requests will use `vscode.postMessage()`.

### 2. Enhance the 'Orchestrator Agent'
-   **Files:** `src/vs/ai-partner/agents/OrchestratorAgent.ts`, `src/vs/ai-partner/extension.ts`
-   **Tasks:**
    -   Implement an "Agent Host" in `extension.ts` to mediate between the `AIPartnerViewProvider` and `OrchestratorAgent`.
    -   Make `OrchestratorAgent.ts` the single entry point for all requests.
    -   Parse user intent and delegate to specialized agents.
    -   Format results from specialized agents and send them back to the UI.

### 3. Implement User Experience (UX) Enhancements
-   **Task: Implement Streaming Responses**
    -   **Files:** `OrchestratorAgent.ts`, specialized agents, `AIPartnerViewProvider.ts`, UI-side code.
    -   **Action:** Stream LLM responses in chunks to the UI for progressive rendering.
-   **Task: Add Task Status Feedback**
    -   **Files:** All agent files, UI-side code.
    -   **Action:** Create a message channel for agents to send real-time status updates (e.g., "Analyzing files...") to the UI.

## Deliverables
1.  Complete, refactored source code.
2.  `REFACTOR_SUMMARY.md` summarizing the architectural changes.

## Constraints
-   No breaking changes to existing core functionality.
-   Adhere to the existing coding style.
-   Comment new architecture clearly.
