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
}

/**
 * Executes a multi-turn agentic loop with tool execution support.
 */
export async function runAgenticLoop(options: AgenticLoopOptions): Promise<string> {
    const { llmService, provider, messages, apiKey, endpoint, tools, model, mcpClient, maxTurns = 5, logger, toolHandler, onStreamingData } = options;
    let turnCount = 0;

    while (turnCount < maxTurns) {
        turnCount++;
        if (logger) logger.log(`[AgenticLoop] Turn ${turnCount}/${maxTurns}`);

        const resp = await llmService.requestLLMCompletion(
            provider, messages, apiKey, endpoint, tools, model, onStreamingData, 60000
        );
        const msg = resp.choices?.[0]?.message;
        const content = (msg?.content ?? (resp as any)?.choices?.[0]?.text ?? '').toString();

        // If we have tool calls, process them
        if (msg?.tool_calls && msg.tool_calls.length > 0) {
            messages.push(msg); // Append assistant message

            for (const toolCall of msg.tool_calls) {
                const fnName = toolCall.function.name;
                const argsStr = toolCall.function.arguments;
                let args: any = {};
                try { args = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr; } catch {}

                if (logger) logger.log(`[AgenticLoop] Tool Call: ${fnName}`);

                // 1. Try custom handler (Interceptor)
                if (toolHandler) {
                    const handled = await toolHandler(fnName, args);
                    if (handled.handled) {
                        if (handled.stopLoop) {
                            return JSON.stringify(handled.result);
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
                    const result = await mcpClient.callTool({
                        name: fnName,
                        arguments: args
                    });
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: fnName,
                        content: JSON.stringify(result)
                    });
                } catch (err: any) {
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
        if (content.trim()) {
            return content;
        }
        
        // Empty content and no tools -> Error or retry?
        // For now, return empty string which might trigger validation error downstream
        return '';
    }

    throw new Error('Max turns reached without final action.');
}
