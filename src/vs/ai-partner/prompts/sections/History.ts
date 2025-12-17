export function getChatHistory(): string {
    const timeStr = new Date().toLocaleString();
    return `<!-- CHAT HISTORY -->
## CHAT HISTORY
- **Current Time**: ${timeStr}
[...System injects recent Conversation History here...]
> **Note**: As a specialist agent, your history mainly consists of **A2A (Agent-to-Agent)** messages identifying your task.`;
}
