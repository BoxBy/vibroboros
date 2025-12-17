import { DeveloperLogService } from '../../services/DeveloperLogService';

/**
 * Executes an LLM generation loop with self-correction.
 * 
 * @param llmCall A function that takes an optional error message (feedback) and returns the LLM's raw text response.
 * @param parser A function that parses the raw text into a structured result (T). Should throw if parsing fails.
 * @param validator A function that validates the parsed result. Returns { valid: true } or { valid: false, error: string }.
 * @param maxRetries Maximum number of attempts (default: 3).
 * @param logger Optional logger for debugging.
 * @returns The successfully parsed and validated result.
 * @throws Error if maxRetries is reached without success.
 */
export async function runLLMLoop<T>(
    llmCall: (previousError?: string) => Promise<string>,
    parser: (text: string) => T,
    validator: (result: T) => { valid: boolean; error?: string },
    maxRetries: number = 3,
    logger?: DeveloperLogService
): Promise<T> {
    let currentError: string | undefined = undefined;
    let lastRawText: string = '';

    for (let i = 0; i < maxRetries; i++) {
        try {
            if (logger) {
                logger.log(`[LLMLoop] Attempt ${i + 1}/${maxRetries} ${currentError ? `(Retry reason: ${currentError})` : ''}`);
            }

            const rawText = await llmCall(currentError);
            lastRawText = rawText;

            // Try parse
            let result: T;
            try {
                result = parser(rawText);
            } catch (parseError: any) {
                currentError = `JSON Parsing Failed: ${parseError.message}. Please ensure you output valid JSON.`;
                if (logger) { logger.log(`[LLMLoop] Parse error: ${parseError.message}`); }
                continue;
            }

            // Validate
            const validation = validator(result);
            if (validation.valid) {
                return result;
            }

            currentError = `Validation Failed: ${validation.error}. Please correct this.`;
            if (logger) { logger.log(`[LLMLoop] Validation error: ${validation.error}`); }

        } catch (e: any) {
            // If the LLM call itself fails (network, etc), we might want to retry or throw.
            // For now, let's treat it as a fatal error unless we want to implement network retries here too.
            // But usually LLMService handles network retries. 
            // If it's a logic error in llmCall, we should probably throw.
            if (logger) { logger.log(`[LLMLoop] Fatal error in llmCall: ${e.message}`); }
            throw e;
        }
    }

    throw new Error(`Failed to generate valid response after ${maxRetries} attempts. Last error: ${currentError}. Raw response: ${lastRawText.slice(0, 200)}...`);
}

export interface AgenticLoopOptions {
    llmService: any; // Avoid circular dependency
    provider: string;
    messages: any[];
    apiKey: string;
    endpoint: string;
    tools: any[];
    model: string;
    mcpClient: any;
    maxTurns?: number;
    logger?: DeveloperLogService;
    toolHandler?: (toolName: string, args: any) => Promise<{ handled: boolean; result?: any; stopLoop?: boolean }>;
    onStreamingData?: (chunk: string) => void;
    onProgress?: (message: string) => void;
    requireToolUse?: boolean;
    validator?: (text: string) => { valid: boolean; error?: string };
}

export class MaxTurnError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MaxTurnError';
    }
}

export interface AgenticLoopResult {
    result: string;
    messages: any[];
}

/**
 * Executes a multi-turn agentic loop with tool execution support.
 */
export async function runAgenticLoop(options: AgenticLoopOptions): Promise<AgenticLoopResult> {
    const { llmService, provider, messages, apiKey, endpoint, tools, model, mcpClient, maxTurns = 5, logger, toolHandler, onStreamingData, onProgress } = options;
    let turnCount = 0;

    while (turnCount < maxTurns) {
        turnCount++;
        if (logger) logger.log(`[AgenticLoop] Turn ${turnCount}/${maxTurns}`);
        console.log(`[AgenticLoop] Turn ${turnCount}/${maxTurns} - Requesting LLM...`);

        const resp = await llmService.requestLLMCompletion(
            provider, messages, apiKey, endpoint, tools, model, onStreamingData, 60000
        );
        console.log(`[AgenticLoop] LLM Response Received. Output length: ${(resp.choices?.[0]?.message?.content || '').length}`);

        const msg = resp.choices?.[0]?.message;
        const content = (msg?.content ?? (resp as any)?.choices?.[0]?.text ?? '').toString();

        let cleanContent = content; // Start with original content

        if (content) {
            const tags = "thinking|thought|reasoning|scratchpad|plan|reflection|analysis|decision";
            const thinkingRegex = new RegExp(
                `(<(${tags})(?:\\s+[^>]*)?>)([\\s\\S]*?)(<\\/\\2>)|` + 
                `(\\[(${tags})\\])([\\s\\S]*?)(\\[\\/\\6\\])`, 
                "gi"
            );
            
            let match;

            while ((match = thinkingRegex.exec(content)) !== null) {
                // Group 3 uses parens 1,2,3,4. 3=content
                // Group 7 uses parens 5,6,7,8. 7=content
                const thought = (match[3] || match[7] || '').trim();
                const tagName = (match[2] || match[6] || 'Thought').toLowerCase();
                
                if (thought && onProgress) {
                    // Capitalize first letter for display
                    const displayTag = tagName.charAt(0).toUpperCase() + tagName.slice(1);
                    onProgress(`[${displayTag}] ${thought}`);
                }
                
                // Remove the full matched tag from cleanContent
                // We do this by replacing the specific match with empty string
                // Note: using replace with string literal only replaces first occurrence, but we iterate.
                // However, iterating on 'content' (immutable) while replacing on 'cleanContent' is safer.
                cleanContent = cleanContent.replace(match[0], '');
            }

            // Also strip raw XML tool call tags that might leak (e.g. <tool_call>, <function>, <parameter>)
            // These might be leftovers if the LLM outputs them in the text stream.
            const toolTagRegex = /<\/?(tool_call|tool_code|function|parameter)(?:[\s\S]*?)>/gi;
            cleanContent = cleanContent.replace(toolTagRegex, '');
            
            if (cleanContent.trim() !== content.trim()) {
                // Determine if we should treat the message as "handled" by thinking?
                // No, we just strip it from the user-facing content.
            }
            
            // Shadowing content variable for the return statement at line 171
            // We can't reassign const 'content'. We need to use a new variable or handle return differently.
            // Let's modify the code to return `cleanContent` instead of `content` at line 172.
            // To do this properly with block replacement, I need the variable to be accessible.
            // I will inject `let finalContent = content;` logic.
        }

        // If we have tool calls, process them
        if (msg?.tool_calls && msg.tool_calls.length > 0) {
            messages.push(msg); // Append assistant message

            for (const toolCall of msg.tool_calls) {
                const fnName = toolCall.function.name;
                const argsStr = toolCall.function.arguments;
                let args: any = {};
                try { args = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr; } catch {}

                if (logger) logger.log(`[AgenticLoop] Tool Call: ${fnName}`);
                console.log(`[AgenticLoop] Executing Tool: ${fnName}`);
                if (onProgress) onProgress(`[Agent] Executing tool: ${fnName}...`);

                // 1. Try custom handler (Interceptor)
                let handlerResult = null;
                if (toolHandler) {
                    const handled = await toolHandler(fnName, args);
                    if (handled.handled) {
                        handlerResult = handled;
                        if (handled.stopLoop) {
                            if (onProgress) onProgress(`[Agent] Tool ${fnName} completed.`);
                            return { result: JSON.stringify(handled.result), messages };
                        }
                        // If handled but not stopping, append result and continue
                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            name: fnName,
                            content: JSON.stringify(handled.result)
                        });
                        continue; // Process next tool call or next turn
                    }
                }

                // 2. Default MCP Execution
                try {
                    // UI Optimization: Skip text logs for file creation tools because they generate distinct UI Blocks.
                    const isFileCreation = ['create_file', 'write_to_file', 'edit_file'].includes(fnName);
                    
                    if (onProgress && !isFileCreation) {
                        onProgress(`[MCP] Executing Tool: ${fnName}${argsStr ? ` with args: ${argsStr}` : ''}`);
                    }
                    const result = await mcpClient.callTool({
                        name: fnName,
                        arguments: args
                    });
                    if (onProgress) onProgress(`[Agent] Tool ${fnName} completed.`);
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: fnName,
                        content: JSON.stringify(result)
                    });
                } catch (err: any) {
                    if (onProgress) onProgress(`[Agent] Tool ${fnName} failed: ${err.message}`);
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: fnName,
                        content: `Error executing tool ${fnName}: ${err.message}`
                    });
                }
            }
            continue; // Loop back to LLM
        }

        // No tool calls, return content
        if (typeof cleanContent !== 'string') { cleanContent = content; } // Fallback if loop didn't run
        if (cleanContent.trim()) {
            // 1. Tool Use Enforcement (Optional)
            const hasUsedTool = messages.some(m => m.role === 'tool');
           
            if (options.requireToolUse && !hasUsedTool) {
                if (logger) logger.log(`[AgenticLoop] Text-only response received but requireToolUse is active. Rejecting.`);
                if (onProgress) onProgress(`[System] Tool use required. Retrying...`);
                messages.push({ role: 'assistant', content: content }); 
                messages.push({ role: 'user', content: 'System: You provided a text response but no tool call. You MUST use a tool (specifically create_file or request_clarification) to proceed.' });
                continue;
            }

            // 2. Output Validation (New)
            if (options.validator && !hasUsedTool) {
                const validation = options.validator(cleanContent);
                if (!validation.valid) {
                     if (logger) logger.log(`[AgenticLoop] Output validation failed: ${validation.error}`);
                     console.log(`[AgenticLoop] Output validation failed: ${validation.error}`);
                     if (onProgress) onProgress(`[System] Output format incorrect. Retrying...`);
                     
                     messages.push({ role: 'assistant', content: content });
                     messages.push({ role: 'user', content: `System: Your response is invalid. Error: ${validation.error}. Please correct the format.` });
                     continue;
                }
            }

            return { result: cleanContent, messages };
        }
        
        // Empty content and no tools -> Error or retry?
        if (options.requireToolUse || options.validator) {
             messages.push({ role: 'user', content: 'System: Empty response received. You MUST provide a valid response.' });
             continue;
        }

        return { result: '', messages };
    }

    throw new MaxTurnError(`Max turns (${maxTurns}) reached without final action.`);
}
