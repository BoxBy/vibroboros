import { SystemPromptContext } from '../types';
import { viperToolRegistry, toolSpecToOpenAITool } from '../tools';
import { ViperToolSpec } from '../tools/ViperToolSpec';

/**
 * Tool usage rules and dynamic list of available tools
 */
export function buildToolUseSection(context: SystemPromptContext, availableTools?: any[]): string {
    const sections: string[] = [];

    // Tool calling rules
    sections.push(`**CRITICAL: Tool Calling Rules**

**When to Use Tools**:
- File creation/modification: When user requests file creation (e.g., "make a file", "create", "save as file"), you MUST use the file write tool via tool_calls
- Directory/file reading: When user asks about files/directories (e.g., "what's in src?", "read config"), use directory listing or file read tools via tool_calls
- Information retrieval: When user needs information that requires file system access, use appropriate tools

**How to Use Tools**:
- Use function calling (tool_calls), NOT text representations like [tool_name(...)] or tool names in natural language
- DO NOT mention internal tool names (e.g., "FileWriteTool", "ListDirTool") in your natural language responses to users
- DO NOT explain what you will do - CALL THE TOOL DIRECTLY
- DO NOT show code in markdown blocks when user wants a file - CALL the file write tool IMMEDIATELY
- If you have tool_calls, keep content minimal (brief confirmation if needed) or empty
- Only include full text explanations when you have NO tool_calls to make

**Tool Selection Priority**:
- When multiple tools can achieve the same result, prefer the most specific, least-privileged tool
- For file operations, prefer read operations before write operations when exploring
- Use StatTool to check existence before FileWriteTool when uncertain about file state

**Code Extraction from Conversation History**:
When the user wants to save code as a file, extract code from conversation history by:
1. Scanning for code blocks (markdown code fences with language tags) in previous messages
2. Looking for code structures and programming constructs in assistant's previous messages
3. Finding code snippets mentioned in user messages
4. Using the most recent and complete code block that matches the user's intent
5. If multiple code blocks exist, prefer the most recent and complete one
6. If code is incomplete or ambiguous, ask for clarification rather than guessing

**Tool Execution Strategy**:
- Execute tools sequentially (one at a time) and wait for results
- Exception: Independent read operations (ListDirTool, FileReadTool) can be parallelized if they don't depend on each other
- Always wait for tool results before making decisions based on them

**Error Handling**:
- If a tool call fails, analyze the error message in your reasoning
- Propose an alternative approach (e.g., check if path exists with StatTool before FileWriteTool)
- Do not retry the same failed action without modification
- If a tool is unavailable, explain the limitation and suggest alternatives`);

    sections.push(`**Semantic Intent Recognition**:
- Do NOT rely on keywords alone (e.g., "make", "create", "file")
- Understand the user's intent from the conversation context:
  * User shows code and says "save this" or "create file" → FileWriteTool
  * User asks "what files are in src?" → ListDirTool
  * User says "read the config" → FileReadTool
- Consider the full conversation flow, not just the current message
- When intent is ambiguous, prefer action (use tools) over explanation

**Examples**:

✅ CORRECT:
User: "create file" (after showing code in previous message)
→ Call FileWriteTool immediately with the code from conversation history

❌ WRONG:
User: "create file"
→ "I will create a file for you. Let me use FileWriteTool..." (text explanation)
→ [FileWriteTool(...)] (text representation)

✅ CORRECT:
User: "what files are in src?"
→ Call ListDirTool with dirPath="src"

❌ WRONG:
User: "what files are in src?"
→ "I'll check the src folder for you..." (explanation without tool call)

**Tool Usage Guidelines**:
- Read each tool's description carefully to understand when and how to use it
- All file paths must be relative to workspace root unless explicitly absolute
- All operations must be within workspace boundaries for security
- After tool execution, you can provide a brief confirmation message
- When in doubt about whether to use a tool, USE THE TOOL - it's better to call a tool than to explain what you would do

**File/Tool Usage Summary Rules**:
- When you read a file using tools, do NOT paste the entire content in your response. Instead, summarize key points or reference specific line ranges.
- When you list directories, provide a concise summary of the structure rather than listing every file.
- Focus on actionable information that helps the user understand the result, not raw data dumps.`);

    // Available tools list
    if (availableTools && availableTools.length > 0) {
        const toolList = availableTools.map((tool: any) => {
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
        }).join('\n\n');

        sections.push(`**Available Tools (use function calling, not text):**
${toolList}`);
    }

    return sections.join('\n\n');
}

