import { SystemPromptContext } from '../types';

export const ToolUse = (context: SystemPromptContext) => {
    console.log(`[ToolUse] Building tool use section. availableTools: ${!!context.availableTools}, length: ${context.availableTools?.length || 0}`);
    const toolDefs = context.availableTools && context.availableTools.length > 0
        ? `**Available Tools (use function calling, not text):**
${context.availableTools.map((tool: any) => {
    const name = tool.function?.name || tool.name || 'Unknown';
    const desc = tool.function?.description || tool.description || 'No description';
    const params = tool.function?.parameters?.properties || {};
    const required = tool.function?.parameters?.required || [];
    const paramList = Object.keys(params).length > 0
        ? Object.entries(params).map(([key, value]: [string, any]) => {
            const isRequired = required.includes(key);
            const type = value?.type || 'any';
            return `${key}${isRequired ? '*' : ''} (${type})`;
        }).join(', ')
        : 'none';
    return `- ${name}: ${desc}\n  Parameters: ${paramList}`;
}).join('\n\n')}`
        : '';

    console.log(`[ToolUse] toolDefs length: ${toolDefs.length}, has tools: ${toolDefs.length > 0}`);
    
    return `**CRITICAL: Tool Calling Rules**

**When to Use Tools**:
- File creation/modification: When user requests file creation (e.g., "make a file", "create", "save as file"), you MUST use the file write tool via tool_calls
- Directory/file reading: When user asks about files/directories (e.g., "what's in src?", "read config"), use directory listing or file read tools via tool_calls
- Information retrieval: When user needs information that requires file system access, use appropriate tools
- Thinking and Reasoning: When faced with a complex problem, ambiguous requirements, or multi-step tasks, use the ThinkTool to plan your approach, analyze the situation, or break down the problem. This helps you reason clearly before taking action.

**How to Use Tools**:
- Use function calling (tool_calls), NOT text representations like [tool_name(...)] or tool names in natural language
- DO NOT mention internal tool names (e.g., "FileWriteTool", "ListDirTool") in your natural language responses to users
- DO NOT explain what you will do - CALL THE TOOL DIRECTLY
- DO NOT show code in markdown blocks when user wants a file - CALL the file write tool IMMEDIATELY
- If you have tool_calls, keep content minimal (brief confirmation if needed) or empty
- Only include full text explanations when you have NO tool_calls to make

**Code Extraction from Conversation History**:
When the user wants to save code as a file (e.g., "save it", "make a file", "create file"), extract code from conversation history by:
1. **IMMEDIATELY** scan the conversation history for code blocks (markdown code fences with language tags)
2. Look for code structures and programming constructs in assistant's previous messages (especially the most recent assistant message)
3. Find code snippets mentioned in user messages
4. Use the most recent and complete code block that matches the user's intent
5. If multiple code blocks exist, prefer the most recent and complete one
6. **CRITICAL**: When user says "save it" or similar short confirmations, they are referring to code shown in the PREVIOUS assistant message. Extract that code and call FileWriteTool immediately.
7. If code is incomplete or ambiguous, ask for clarification rather than guessing
8. **DO NOT** respond with text like "I will create a file" - just call FileWriteTool directly with the extracted code

**Tool Execution Strategy**:
- **Parallel Execution**: You can and SHOULD call multiple tools in a single turn when they are independent (e.g., reading multiple files, listing multiple directories). This is much faster than sequential calls.
- **Chaining**: If you need to perform a sequence of actions (e.g., create a file then read it to verify), you can often do this in a single turn if the tools allow, or plan for the next turn immediately.
- **Wait for Results**: Always wait for tool results before making decisions based on them. Do not hallucinate tool outputs.

**Error Handling**:
- If a tool call fails, analyze the error message in your reasoning
- Propose an alternative approach (e.g., check if path exists with StatTool before FileWriteTool)
- Do not retry the same failed action without modification
- If a tool is unavailable, explain the limitation and suggest alternatives

**Semantic Intent Recognition**:
- Do NOT rely on keywords alone (e.g., "make", "create", "file")
- Understand the user's intent from the conversation context:
  * User shows code and says "save this" or "create file" → file write tool
  * User says "save it" after assistant showed code → extract code from previous assistant message and call file write tool IMMEDIATELY
  * User asks "what files are in src?" → directory listing tool
  * User says "read the config" → file read tool
- Consider the full conversation flow, not just the current message
- **CRITICAL**: Short confirmations like "save it" after code was shown mean "save the code I just showed you" - extract from previous messages and call FileWriteTool
- When intent is ambiguous, prefer action (use tools) over explanation

**Tool Selection Priority**:
- When multiple tools can achieve the same result, prefer the most specific, least-privileged tool
- For file operations, prefer read operations before write operations when exploring
- Use StatTool to check existence before FileWriteTool when uncertain about file state

**File/Tool Usage Summary Rules**:
- When you read a file using tools, do NOT paste the entire content in your response. Instead, summarize key points or reference specific line ranges.
- When you list directories, provide a concise summary of the structure rather than listing every file.
- Focus on actionable information that helps the user understand the result, not raw data dumps.

${toolDefs}`;
};
