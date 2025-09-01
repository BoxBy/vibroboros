# Task 2: Enhance the 'Orchestrator Agent' Role

## Objective
Refine `OrchestratorAgent.ts` to be a more intelligent and robust entry point for all user requests. This involves improving its ability to parse user intent and delegate tasks to the correct specialized agents, and then properly handling the results.

## Key Steps

1.  **Analyze `OrchestratorAgent.ts`'s `handleChatAndSpecialistCommands` method:**
    -   Review the current keyword-based routing logic (e.g., `if (lowerCaseQuery.includes('refactor'))`).
    -   Identify its limitations: it's rigid, doesn't handle complex queries, and is hard to scale.

2.  **Refactor Intent Parsing:**
    -   Instead of simple keyword matching, introduce a more sophisticated mechanism. A good first step is to use a dedicated LLM call to classify the user's intent.
    -   The prompt for this classification call should instruct the LLM to choose the most appropriate "tool" or "specialist agent" from a provided list.
    -   This will replace the current `if/else if` block with a more dynamic dispatch based on the LLM's classification.

3.  **Standardize Agent-to-Agent (A2A) Communication:**
    -   Ensure that when `OrchestratorAgent` delegates a task, it does so using a standardized `A2AMessage` format.
    -   Review how specialized agents (`DocumentationGenerationAgent`, `RefactoringSuggestionAgent`, etc.) are invoked and how they respond.
    -   The `OrchestratorAgent` needs to handle the asynchronous responses from these agents via the `handleA2AMessage` method.

4.  **Improve Result Handling:**
    -   When a specialized agent completes its task and sends a response back to the `OrchestratorAgent`, the orchestrator must parse this result.
    -   It should then format the result into a user-friendly message.
    -   Finally, it will use the `_onDidPostMessage.fire()` event to send the formatted response back to the UI.

## Expected Outcome
-   `OrchestratorAgent.ts` can handle a wider variety of user commands.
-   The logic for routing tasks to specialized agents is more scalable and less brittle.
-   The flow of receiving a request, delegating it, receiving a result, and sending a final response to the UI is clear and robust.
