# Task 1: Decouple UI and Agent Logic

## Objective
Refactor `AIPartnerViewProvider.ts` to separate the UI logic from the business logic. The provider should only be responsible for creating the webview and managing communication with the new Agent Host.

## Key Steps

1.  **Analyze `AIPartnerViewProvider.ts`:**
    -   Identify all code related to business logic (e.g., making API calls, handling file system operations, managing state).
    -   Identify all UI event listeners and how they currently trigger business logic.

2.  **Refactor `AIPartnerViewProvider.ts`:**
    -   Remove all business logic from this file.
    -   Modify the event handlers to dispatch messages to the webview using `vscode.postMessage()`.
    -   The provider will now act as a simple message forwarder between the webview and the extension's main process.

3.  **Implement the Agent Host (in `extension.ts`):**
    -   Create a message handler in `extension.ts` to receive messages from `AIPartnerViewProvider`.
    -   This host will be responsible for creating an instance of the `OrchestratorAgent`.
    -   Forward incoming messages from the UI to the `OrchestratorAgent` for processing.

## Expected Outcome
-   `AIPartnerViewProvider.ts` is significantly simplified, containing only UI-related setup and message-passing code.
-   All business logic is initiated from `extension.ts` via the `OrchestratorAgent`.
-   Communication between the UI and the agent is purely message-based.
