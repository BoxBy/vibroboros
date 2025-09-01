# Task: Implement Conditional Pruning

## Feature: Implement Intelligent Context Management
Modify the existing OrchestratorAgent and related files to dynamically manage the conversation history sent to the LLM.

## Task: Implement Conditional Pruning

### Modify LLMService.ts:
In vibroborus/src/vs/ai-partner/services/LLMService.ts, add an optional property `pruningState?: 'pending' | 'keep' | 'prune';` to the `LlmMessage` type definition. This will be used to track the contextual relevance of messages containing large, potentially disposable content.

### Update OrchestratorAgent.ts System Prompt:
In `createSystemPrompt`, add a new rule instructing the LLM to wrap long, potentially non-essential content (like code blocks, logs, or file dumps) within `<prunable>...</prunable>` tags. This allows the agent to identify content that can be conditionally excluded.

### Implement Pruning Logic:
- In `processLlmResponse`, when an assistant message with `<prunable>` tags is received, save it to `llmConversationHistory` with `pruningState: 'pending'`.
- In `handleChatAndSpecialistCommands`, before processing a new user message, check if the previous assistant message has a `pruningState` of `'pending'`.
- If the new user message contains keywords indicating relevance (e.g., "this code," "that file," "it," "저 코드"), change the previous message's `pruningState` to `'keep'`.
- Otherwise, change it to `'prune'`.
- Create a new private method `getPrunedHistory()`. This method will filter the `llmConversationHistory`, replacing the content of any message marked as `'prune'` with a placeholder like `[Content pruned for brevity]` before returning the list. The `processLlmResponse` function must call this method to get the context to send to the LLM.
