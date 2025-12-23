import { DeveloperLogService } from '../../services/DeveloperLogService';
import { LLMService, LlmMessage } from '../../services/LLMService';
import * as vscode from 'vscode';

// Restore MaxTurnError class if it was accidentally removed or needs to be at top level
export class MaxTurnError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MaxTurnError';
    }
}

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
                if (logger) {
                    logger.log(`[LLMLoop] Parse error: ${parseError.message}`);
                }
                continue;
            }

            // Validate
            const validation = validator(result);
            if (validation.valid) {
                return result;
            }

            currentError = `Validation Failed: ${validation.error}. Please correct this.`;
            if (logger) {
                logger.log(`[LLMLoop] Validation error: ${validation.error}`);
            }

        } catch (e: any) {
            // If the LLM call itself fails (network, etc), we might want to retry or throw.
            // For now, let's treat it as a fatal error unless we want to implement network retries here too.
            // But usually LLMService handles network retries. 
            // If it's a logic error in llmCall, we should probably throw.
            if (logger) {
                logger.log(`[LLMLoop] Fatal error in llmCall: ${e.message}`);
            }
            throw e;
        }
    }

    throw new Error(`Failed to generate valid response after ${maxRetries} attempts. Last error: ${currentError}. Raw response: ${lastRawText.slice(0, 200)}...`);
}

export interface AgenticLoopOptions {
    llmService: LLMService;
    messages: LlmMessage[];
    apiKey: string;
    endpoint: string | undefined;
    tools: any[];
    model: string;
    agentName: string;
    logger: DeveloperLogService;
    mcpClient?: any;
    maxTurns?: number;
    requireToolUse?: boolean;
    provider?: string;
    validator?: (text: string) => { valid: boolean; error?: string };
    toolHandler?: (name: string, args: any) => Promise<any>;
    onStreamingData?: (chunk: string) => void;
    onProgress?: (msg: string, isStreaming?: boolean) => void;
    token?: vscode.CancellationToken;
    maxConsecutiveErrors?: number; // New option for consecutive error limit
}

export async function runAgenticLoop(options: AgenticLoopOptions): Promise<{ result: string, messages: LlmMessage[] }> {
    const { 
        llmService, messages, apiKey, endpoint, tools, model, agentName, logger, 
        maxTurns = 100, requireToolUse = true, provider, validator, toolHandler, 
        mcpClient, onStreamingData, onProgress, token, maxConsecutiveErrors = 5 // Default to 5
    } = options;

    let turnCount = 0;
    let consecutiveErrors = 0; // Track consecutive errors
    let lastError = '';

    while (turnCount < maxTurns) {
        if (token && token.isCancellationRequested) {
            logger.log(`[AgenticLoop] Cancellation requested. Stopping loop.`);
            if (onProgress) onProgress('[System] Execution stopped by user.');
            return { result: 'Execution stopped by user.', messages };
        }

        turnCount++;
        if (consecutiveErrors >= maxConsecutiveErrors) {
            const errorMsg = `[AgenticLoop] Terminating due to ${maxConsecutiveErrors} consecutive errors. Last error: ${lastError}`;
            logger.log(errorMsg);
             messages.push({ role: 'assistant', content: JSON.stringify({
                targetAgent: 'Orchestrator',
                type: 'error',
                thought: 'Too many consecutive errors encountered.',
                payload: {
                    error: true,
                    message: `Terminated after ${maxConsecutiveErrors} consecutive errors. Last error: ${lastError}`,
                    senderName: agentName
                }
            }, null, 2) });
            return { result: `Execution terminated due to ${maxConsecutiveErrors} consecutive errors.`, messages };
        }

        if (logger) {
            logger.log(`[AgenticLoop] Turn ${turnCount}/${maxTurns}`);
        }
        console.log(`[AgenticLoop] Turn ${turnCount}/${maxTurns} - Requesting LLM...`);

        // Stream Parser Logic
        let streamBuffer = '';
        let thoughtBuffer = '';
        let currentThoughtTag: string | null = null;
        let inThought = false;
        
        const internalStreamingCallback = (chunk: string) => {
            if (!chunk) {
                return;
            }
            
            // Pass through to original callback if exists (for raw streaming)
            if (onStreamingData) {
                onStreamingData(chunk);
            }
            
            // Thought Stream Parser
            if (onProgress) {
                streamBuffer += chunk;
                
                // Detection Regex for start tag
                const startTagRegex = /<(thinking|thought|reasoning|scratchpad|plan|reflection|analysis|decision)(?:\s+[^>]*)?>/i;
                const endTagRegex = /<\/(thinking|thought|reasoning|scratchpad|plan|reflection|analysis|decision)>/i;

                if (!inThought) {
                    const match = startTagRegex.exec(streamBuffer);
                    if (match) {
                        inThought = true;
                        currentThoughtTag = match[1];
                        // Remove everything before and including the start tag from buffer to start fresh for content
                        const tagEndIndex = match.index + match[0].length;
                        // But wait, we might have content immediately after tag in the same chunk
                        thoughtBuffer = streamBuffer.slice(tagEndIndex);
                        streamBuffer = ''; // Reset main buffer
                        
                        // Emit initial thought starter if needed? or just wait for content
                        // onProgress(`[${currentThoughtTag}] `); // Optional: indicate start
                    }
                } else {
                    // We are in thought
                    thoughtBuffer += chunk; // Add raw chunk to thought buffer
                    
                    // Check for end tag in thoughtBuffer
                    // Note: End tag might be split across chunks. 
                    // Simple heuristic: check if thoughtBuffer contains the specific end tag we are looking for.
                    // If we know the tag name, we look for </tagName>
                    const specificEndTag = `</${currentThoughtTag}>`;
                    const endIdx = thoughtBuffer.toLowerCase().indexOf(specificEndTag.toLowerCase());
                    
                    if (endIdx !== -1) {
                         // End detected
                         // Re-think: simple pass-through if we are sure we are in thought.
                         // BUT we need to not print the end tag.
                         
                         // Let's implement a simpler "flush" approach.
                         // We just emit chunk if we are in thought and it doesn't look like an end tag.
                    }
                }
                
                // Refined logic for streaming chunks:
                if (inThought) {
                    // Check for closing tag
                    const endMatch = endTagRegex.exec(thoughtBuffer);
                    if (endMatch) {
                        // Closing tag found
                        const content = thoughtBuffer.slice(0, endMatch.index);
                        if (content) {
                            // [Streaming] Send chunk with isStreaming=true
                            onProgress(content, true);
                        }
                        inThought = false;
                        currentThoughtTag = null;
                        streamBuffer = thoughtBuffer.slice(endMatch.index + endMatch[0].length);
                        thoughtBuffer = '';
                    } else {
                        // No closing tag yet.
                        // Safe to emit? 
                        const SAFE_margin = 15;
                        if (thoughtBuffer.length > SAFE_margin) {
                            const toEmit = thoughtBuffer.slice(0, thoughtBuffer.length - SAFE_margin);
                            // [Streaming] Send chunk with isStreaming=true
                            onProgress(toEmit, true);
                            thoughtBuffer = thoughtBuffer.slice(thoughtBuffer.length - SAFE_margin);
                        }
                    }
                }
            }
        };


        // [UI Fix] Emit "Thinking..." start signal so the UI creates a new log item for thought streaming.
        // This ensures that even if previous turns had tool logs, the new thought stream has a fresh target.
        if (onProgress) {
             // [UI Tweak] Use specific agent name for initial log title
            onProgress(`[${options.agentName || 'Agent'}] Thinking...`);
        }

        const resp = await llmService.requestLLMCompletion(
            (provider || 'openai') as any, messages, apiKey, endpoint || '', tools, model, internalStreamingCallback, 60000
        );
        console.log(`[AgenticLoop] LLM Response Received. Output length: ${(resp.choices?.[0]?.message?.content || '').length}`);

        const msg = resp.choices?.[0]?.message;
        const content = (msg?.content ?? (resp as any)?.choices?.[0]?.text ?? '').toString();
        // [User Request] Log raw content for visibility
        console.log(`[AgenticLoop] LLM Raw Output:\n${content}`);

        let cleanContent = content; // Start with original content

        if (content) {
            // [Streaming] Already handled by onStreamingData if provided. 
            // Here we just clean up the final content for tool processing.
            
            // Strip thoughts from cleanContent (same as original logic)
            const tags = "thinking|thought|reasoning|scratchpad|plan|reflection|analysis|decision";
            const thinkingRegex = new RegExp(
                `(<(${tags})(?:\\s+[^>]*)?>)([\\s\\S]*?)(<\\/\\2>)|` + 
                `(\\[(${tags})\\])([\\s\\S]*?)(\\[\\/\\6\\])`, 
                "gi"
            );
            
            // Note: We don't need to emit onProgress here if streaming handled it.
            // But if no streaming was available (e.g. non-stream provider), we might want to emit batch thoughts here.
            // We can detect if we streamed thoughts by checking a flag or just emitting again (idempotent UI likely handles it, but better avoid dupes).
            // For now, let's keep batch emission as safety net, UI should handle dupes if needed, or we rely on stream ONLY.
            
            cleanContent = content.replace(thinkingRegex, ''); // Remove thoughts from final content
            cleanContent = cleanContent.replace(/<\/?(tool_call|tool_code|function|parameter)(?:[\s\S]*?)>/gi, '');

            // [Fix] Strip markdown code blocks if present (common with some models)
            const markdownBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
            const match = markdownBlockRegex.exec(cleanContent);
            if (match) {
                cleanContent = match[1].trim();
            }
        }

        // If we have tool calls, process them
        if (msg?.tool_calls && msg.tool_calls.length > 0) {
            messages.push(msg); // Append assistant message

            for (const toolCall of msg.tool_calls) {
                const fnName = toolCall.function.name;
                const argsStr = toolCall.function.arguments;
                let args: any = {};
                try { args = typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr; } catch {}

                if (logger) {
                    logger.log(`[AgenticLoop] Tool Call: ${fnName}`);
                }
                
                // [Cancellation Check]
                if (token && token.isCancellationRequested) {
                    if (onProgress) onProgress('Stop requested by user...');
                    return { result: 'Execution stopped by user.', messages };
                }

                console.log(`[AgenticLoop] Executing Tool: ${fnName}`);
                // [User Request] Removed redundant log (MCP already logs it)
                // if (onProgress) onProgress(`[Agent] Executing tool: ${fnName}...`);

                // 1. Try custom handler (Interceptor)
                if (toolHandler) {
                    const handled = await toolHandler(fnName, args);
                    if (handled.handled) {
                        if (handled.stopLoop) {
                            if (onProgress) {
                                onProgress(`[Agent] Tool ${fnName} completed.`);
                            }
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
                    const isFileAction = ['create_file', 'write_to_file', 'edit_file', 'delete_file', 'put_file', 'replace_file_content', 'write_file', 'patch_file'].includes(fnName);
                    
                    if (onProgress && !isFileAction) {
                        onProgress(`[MCP] Executing Tool: ${fnName}${argsStr ? ` with args: ${argsStr}` : ''}`);
                    }
                    const result = await mcpClient.callTool({
                        name: fnName,
                        arguments: args
                    });
                    // [User Request] Removed redundant log
                    // if (onProgress) onProgress(`[Agent] Tool ${fnName} completed.`);
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
                if (logger) {
                    logger.log(`[AgenticLoop] Text-only response received but requireToolUse is active. Rejecting.`);
                }
                if (onProgress) {
                    onProgress(`[System] Tool use required. Retrying...`);
                }
                messages.push({ role: 'assistant', content: content }); 
                messages.push({ role: 'user', content: 'System: You provided a text response but no tool call. You MUST use a tool (specifically create_file or request_clarification) to proceed.' });
                continue;
            }

            // 2. Output Validation (New)
            if (options.validator) {
                const validation = options.validator(cleanContent);
                if (validation.valid) {
                     // Empty
                } else {
                     if (logger) {
                         logger.log(`[AgenticLoop] Output validation failed: ${validation.error}`);
                     }
                     console.log(`[AgenticLoop] Output validation failed: ${validation.error}`);
                     if (onProgress) {
                         onProgress(`[System] Output format incorrect. Retrying...`);
                     }
                     
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
