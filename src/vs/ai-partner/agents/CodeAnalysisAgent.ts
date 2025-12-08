import * as vscode from 'vscode';
import { AgentCard, Message } from "@a2a-js/sdk";
import { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from 'uuid';
import { LLMService } from '../services/LLMService';
import { getCoreLLMTools } from '../services/LLMTools';
import { getRobustToolUsePrompt } from '../prompts/sections/ToolUse';
import { ConfigService } from '../config_service';
import { getMcpClient } from "../mcp_client_provider";
import * as path from 'path';
import * as mcpClientModule from "@modelcontextprotocol/sdk/client";
import { runLLMLoop } from './utils/agentHelpers';
import { publishProgressLog } from './utils/sdkProgressHelper';

export class CodeAnalysisAgent implements AgentExecutor {
    private llmService: LLMService;
    private configService: ConfigService;
    private mcpClient: mcpClientModule.Client;

    constructor(private card: AgentCard, private workspaceState: vscode.Memento) {
        this.llmService = LLMService.getInstance();
        this.configService = ConfigService.getInstance();
        this.mcpClient = getMcpClient();
    }

    async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
        // Define sender outside try block for access in catch
        let sender = 'OrchestratorAgent';
        try {
            const anyCtx: any = requestContext as any;
            const incoming = anyCtx?.message || anyCtx?.request?.message || anyCtx?.request || anyCtx;
            
            // Dynamic Routing: Identify the sender to reply to (safely extracted early)
            sender = incoming?.senderName || incoming?.sender || incoming?.from || 'OrchestratorAgent';
            publishProgressLog(eventBus, `[CodeAnalysisAgent] Request received from: ${sender}`, requestContext);

            // SDK Standard: Extract parts from message
            let parts = Array.isArray(incoming?.parts) ? incoming.parts : (Array.isArray(anyCtx?.parts) ? anyCtx.parts : []);
            
            
            // Minimal fallback for compatibility
            if (parts.length === 0 && incoming?.userMessage && typeof incoming.userMessage === 'string') {
                parts = [{ kind: 'text', text: incoming.userMessage.trim() }];
            }
            
            const textPart = parts?.find?.((p: any) => p && (p.kind === 'text' || p.type === 'text') && typeof (p.text ?? p.content) === 'string' && String(p.text ?? p.content).trim().length > 0);
            const nl: string = textPart ? String((textPart as any).text ?? (textPart as any).content).trim() : '';
            
            // SDK Standard: Extract filePath and correlation from data part
            let correlation: any = undefined;
            let filePath: string = '';
            const dataPart = parts.find((p: any) => p && p.kind === 'data' && typeof p.mimeType === 'string' && p.mimeType.includes('application/vnd.a2a+json') && p.data);
            if (dataPart) {
                filePath = dataPart.data.filePath || '';
                correlation = dataPart.data.correlation;
            }
            
            // Fallback: extract from text if not in data part
            if (!filePath && nl) {
                const m = nl.match(/([A-Za-z]:\\[^\s\"']+\.[A-Za-z0-9]+|[^\s\"']+\.[A-Za-z0-9]+)/);
                if (m && m[1]) { filePath = m[1].trim(); }
            }
            publishProgressLog(eventBus, `[CodeAnalysisAgent] Analyzing file: ${filePath || '(from context)'}`, requestContext);

            // Resolve within workspace and read via MCP FileReadTool (relative path)
            const workspaceFolders = vscode.workspace.workspaceFolders;
            const roots = Array.isArray(workspaceFolders) ? workspaceFolders.map(f => path.normalize(f.uri.fsPath)) : [];
            const baseRoot = roots[0] || '';
            let absoluteCandidate: string = filePath;
            if (filePath) {
                absoluteCandidate = path.isAbsolute(filePath) ? path.normalize(filePath) : (baseRoot ? path.normalize(path.resolve(baseRoot, filePath)) : path.normalize(filePath));
            }
            let relativeForTool = filePath;
            try {
                const matchedRoot = roots.find(root => {
                    const rel = path.relative(root, absoluteCandidate);
                    return (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) || rel === '';
                });
                if (matchedRoot) { relativeForTool = path.relative(matchedRoot, absoluteCandidate); }
            } catch {}
            
            let code = '';
            try {
                const fileContentResponse = await (this.mcpClient as any).callTool({ name: 'FileReadTool', arguments: { filePath: relativeForTool || filePath } });
                code = (fileContentResponse as any)?.structuredContent?.content
                    || ((fileContentResponse as any)?.content?.find?.((b: any) => b?.type === 'text')?.text)
                    || '';

            } catch {}
            
            // Support for contextFiles (Plan Context)
            let additionalContext = '';
            const contextFiles = (dataPart?.data as any)?.contextFiles as string[] || [];
            if (contextFiles && Array.isArray(contextFiles) && contextFiles.length > 0) {
                for (const cf of contextFiles) {
                    if (typeof cf !== 'string') continue;

                    if (cf === filePath) continue; // Skip primary file
                    try {
                        let absCf = cf;
                        if (!path.isAbsolute(cf)) {
                            absCf = baseRoot ? path.join(baseRoot, cf) : cf;
                        }
                        const buf = await vscode.workspace.fs.readFile(vscode.Uri.file(absCf));
                        const content = Buffer.from(buf).toString('utf-8');
                        const langCtx = this.getLanguageFromFilePath(absCf);
                        additionalContext += `\n\n**Referenced File (${path.basename(cf)}):**\n\`\`\`${langCtx}\n${content}\n\`\`\``;
                    } catch (e) {
                         console.log(`[CodeAnalysisAgent] Failed to read context file ${cf}:`, e);
                    }
                }
            }

            
            if (!code || String(code).trim().length === 0) {
                try {
                    const buf = await vscode.workspace.fs.readFile(vscode.Uri.file(absoluteCandidate));
                    code = Buffer.from(buf).toString('utf-8');
                    try { console.log('[CodeAnalysisAgent] Fallback read via VS Code FS succeeded.'); } catch {}
                } catch {}
            }
            const language = this.getLanguageFromFilePath(filePath);
            const queryStr = (incoming?.task?.data?.query ?? nl ?? '').toString();

            const submitAnalysisTool = {
                type: 'function',
                function: {
                    name: 'submit_analysis',
                    description: 'Submit the final code analysis report.',
                    parameters: {
                        type: 'object',
                        properties: {
                            analysis: {
                                type: 'string',
                                description: 'The detailed code analysis report in Markdown format.'
                            }
                        },
                        required: ['analysis'],
                        additionalProperties: false
                    }
                }
            };

            const prompt = `
Analyze the provided source code and answer the user's query.
${getRobustToolUsePrompt()}
**CRITICAL INSTRUCTION**: You MUST provide a DETAILED, IN-DEPTH analysis. Short, lazy, or summary-only responses are invalid. Dig deep into the code's logic, potential issues, and optimization opportunities.


**Context:**
*   **File:** \`${filePath}\`
*   **Language:** \`${language}\`
*   **User Query:** "${queryStr}"

**Task:**
Perform a deep static analysis of the code. Identify potential bugs, security vulnerabilities, performance bottlenecks, and code style issues. Explain your reasoning clearly.

**Output Specification:**
You must use the \`submit_analysis\` tool to return your report.
Call \`submit_analysis\` with the Markdown report in the \`analysis\` argument.
CLARIFICATION: If you need more info, return ONLY a JSON object: {"request_clarification": {"question": "...", "context": "..."}}

**Source Code:**
\`\`\`${language}
${code}
\`\`\`
${additionalContext}
            `;

            console.log('Generating analysis with LLM...');
            const model = this.configService.getModel();
            const apiKeys = await this.configService.getApiKeys();
            const apiKey = apiKeys[0] || '';
            const endpoint = this.configService.getEndpoint();
            const provider = this.configService.getLlmProvider();

            const llmCall = async (previousError?: string) => {
                const messages: any[] = [
                    { role: 'system', content: 'You are an expert code analyzer. Output in English unless explicitly asked otherwise.' },
                    { role: 'user', content: prompt }
                ];
                if (previousError) {
                    messages.push({ role: 'user', content: `Previous attempt failed: ${previousError}. Please try again.` });
                }
                const stream = this.configService.isStreamingEnabled(this.card.name);
                let buffer = '';
                let inThinkingBlock = false;
                const onChunk = stream ? (chunk: string) => {
                    if (!chunk) return;
                    buffer += chunk;
                    
                    let output = '';
                    let i = 0;
                    
                    while (i < buffer.length) {
                        if (inThinkingBlock) {
                            const closeIdx = buffer.indexOf('</thinking>', i);
                            if (closeIdx !== -1) {
                                // Found closing tag. Output content up to tag.
                                output += buffer.slice(i, closeIdx);
                                inThinkingBlock = false;
                                i = closeIdx + 11; // Skip </thinking>
                            } else {
                                // No closing tag. Output safe part, keep tail for partial tag.
                                // </thinking> is 11 chars.
                                const remaining = buffer.length - i;
                                if (remaining < 11) {
                                    break; // Keep all in buffer
                                } else {
                                    const safeEnd = buffer.length - 10;
                                    output += buffer.slice(i, safeEnd);
                                    i = safeEnd;
                                    break;
                                }
                            }
                        } else {
                            const openIdx = buffer.indexOf('<thinking>', i);
                            if (openIdx !== -1) {
                                // Found opening tag.
                                inThinkingBlock = true;
                                i = openIdx + 10; // Skip <thinking>

                                // Force a new log line for the new thinking block
                                const startMsg: Message = {
                                    kind: 'message',
                                    messageId: uuidv4(),
                                    role: 'agent',
                                    parts: [{
                                        kind: 'data',
                                        mimeType: 'application/vnd.a2a+json',
                                        data: {
                                            toolName: 'OrchestratorAgent',
                                            command: 'status-update',
                                            payload: { state: 'working', message: '> ', final: false }
                                        }
                                    }],
                                    contextId: requestContext.contextId
                                } as any;
                                eventBus.publish(startMsg as any);
                            } else {
                                // No opening tag. Suppress everything but keep tail for partial tag.
                                // <thinking> is 10 chars.
                                const remaining = buffer.length - i;
                                if (remaining < 10) {
                                    break; // Keep all in buffer
                                } else {
                                    // Suppress content (skip i)
                                    const safeEnd = buffer.length - 9;
                                    i = safeEnd;
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Update buffer to keep only unprocessed part
                    buffer = buffer.slice(i);

                    if (output) {
                        const streamingMsg: Message = {
                            kind: 'message',
                            messageId: uuidv4(),
                            role: 'agent',
                            parts: [{
                                kind: 'data',
                                mimeType: 'application/vnd.a2a+json',
                                data: {
                                    toolName: 'OrchestratorAgent',
                                    command: 'status-update',
                                    payload: { state: 'streaming-chunk', message: output, final: false }
                                }
                            }],
                            contextId: requestContext.contextId
                        } as any;
                        eventBus.publish(streamingMsg as any);
                    }
                } : undefined;

                // Combine core tools with our submit tool
                const tools = [...getCoreLLMTools(provider), submitAnalysisTool];

                const resp = await this.llmService.requestLLMCompletion(
                    provider, messages, apiKey, endpoint, tools, model,
                    onChunk
                );

                // Check for tool calls first (SDK Standard)
                const toolCalls = resp.choices[0]?.message?.tool_calls;
                if (toolCalls && toolCalls.length > 0) {
                    const submission = toolCalls.find((t: any) => t.function.name === 'submit_analysis');
                    if (submission) {
                        console.log('[CodeAnalysisAgent] Tool call received:', submission.function.arguments);
                        return submission.function.arguments; // Return JSON string of args
                    }
                }

                const content = (resp.choices[0]?.message?.content ?? (resp as any)?.choices?.[0]?.text ?? '').toString();
                console.log('[CodeAnalysisAgent] Raw content received (no tool call):', content);
                return content;
            };

            const parser = (text: string) => {
                // 0. Strip <thinking> tags to find the actual payload
                // Use a more robust regex that handles newlines
                const cleanText = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();

                // 1. Try parsing as JSON (Tool arguments or Clarification)
                try {
                    const json = JSON.parse(cleanText || text);
                    if (json.analysis) return json.analysis;
                    if (json.request_clarification) return json;
                } catch {}

                // 1.5 Try parsing JSON from markdown code blocks (common failure mode)
                const jsonMatch = (cleanText || text).match(/```json\n([\s\S]*?)\n```/);
                if (jsonMatch) {
                    try {
                        const json = JSON.parse(jsonMatch[1]);
                        if (json.analysis) return json.analysis;
                        if (json.request_clarification) return json;
                    } catch {}
                }

                // 2. Fallback: Content Check
                // If cleanText is substantial, return it.
                if (cleanText.length > 5) {
                    return cleanText;
                }

                // 3. Thinking Tag Extraction (Aggressive Fallback)
                // If the cleaned text is empty, it's possible the LLM put the *entire* response inside <thinking>.
                if (!cleanText && text.length > 10) {
                    const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/i);
                    if (thinkingMatch && thinkingMatch[1].length > 5) {
                        return thinkingMatch[1].trim();
                    }
                }
                
                // 4. Absolute Fallback: Just return the raw text
                // Even if short, returning it allows the validator to decide, 
                // or at least shows *something* to the user instead of a generic "too short" error.
                return text;
            };

            const validator = (parsed: any) => {
                if (typeof parsed === 'string') {
                    // Critical: Reject "planning" responses that are not actual analysis
                    const lower = parsed.toLowerCase();
                    if (lower.startsWith('i will') || lower.startsWith('i need to') || lower.includes('step 1:')) {
                        // Heuristic: If it looks like a plan but is short (< 200 chars), it's probably a refusal/plan, not the result.
                        if (parsed.length < 200) {
                            return { valid: false, error: "Response looks like a plan, not an analysis. You MUST perform the analysis and return the REPORT." };
                        }
                    }

                    // Relaxed validation: Allow shorter responses if they are valid markdown
                    if (parsed.length < 10) { 
                        return { valid: false, error: `Response is empty or too short. Please provide the analysis report.` }; 
                    }
                    return { valid: true };
                }
                if (parsed.request_clarification) {
                    if (!parsed.request_clarification.question) { return { valid: false, error: "Missing clarification question" }; }
                    return { valid: true };
                }
                return { valid: true };
            };

            let generatedAnalysis: any;
            try {
                generatedAnalysis = await runLLMLoop(llmCall, parser, validator, 3);
            } catch (e: any) {
                generatedAnalysis = `<!-- Failed to generate analysis: ${e.message} -->`;
            }

            // Handle Clarification
            if (typeof generatedAnalysis !== 'string' && generatedAnalysis?.request_clarification) {
                const { question, context, options } = generatedAnalysis.request_clarification;
                const clarificationMsg: Message = {
                    kind: 'message',
                    messageId: uuidv4(),
                    role: 'agent',
                    parts: [{
                        kind: 'data',
                        mimeType: 'application/vnd.clarification-request+json',
                        data: { question, context, options }
                    }],
                    contextId: requestContext.contextId
                } as any;
                eventBus.publish(clarificationMsg);
                return;
            }

            if (typeof generatedAnalysis !== 'string') {
                 generatedAnalysis = '<!-- No analysis generated -->';
            }

            const artifact: any = {
                kind: 'artifact',
                artifactId: uuidv4(),
                mimeType: 'text/markdown',
                data: generatedAnalysis,
                description: `Analysis for ${filePath}`
            };
            eventBus.publish(artifact as any);

            // Check if this was an A2A request that expects a direct response
            const isFailure = typeof generatedAnalysis === 'string' && generatedAnalysis.startsWith('<!-- Failed');
            
            // Localization
            const userLanguage = vscode.env.language || 'en';
            const isKorean = userLanguage.startsWith('ko');
            
            let question = isFailure 
                ? (isKorean ? '분석에 실패했습니다. 아래 세부 정보를 확인하세요.' : 'Analysis Failed. See details below.')
                : (isKorean ? '분석이 완료되었습니다. 아래 보고서를 검토하세요.' : 'Analysis completed. Please review the report below.');
                
            const options = isFailure 
                ? (isKorean ? ['재시도', '취소'] : ['Retry', 'Cancel'])
                : (isKorean ? ['진행', '추가 질문'] : ['Proceed', 'Ask follow-up question']);

            // If the request has a 'replyTo' or if the context implies an agent-to-agent call, we should reply to the sender.
            // If the request has a 'replyTo' or if the context implies an agent-to-agent call, we should reply to the sender.
            // However, the current architecture uses eventBus for everything.
            // If the request came from OrchestratorAgent via 'performAction', Orchestrator might be listening for a 'response' or 'completion'.
            
            // If the analysis failed, we still want to show it to the user?
            // User said: "CodeAnalysisAgent's response why here? It should go to the calling Agent?"
            
            // If the request has a specific contextId that maps to an A2A transaction, we should reply with a 'response' kind.
            // But here we are sending a 'request-clarification' command to OrchestratorAgent.
            
            // Let's check if we should send a direct response instead.
            // If the requestContext has a 'replyTo' field (hypothetically), or if we infer it.
            
            // For now, let's assume if it's NOT a direct user chat interaction (which we can't easily tell),
            // we should try to return the data.
            
            // BUT, the user explicitly complained about the "Analysis completed..." message appearing in chat.
            // So we should ONLY send that if we are sure the user needs to see it.
            
            // If we just publish the artifact (lines 346-353), the Orchestrator should pick it up if it's monitoring artifacts.
            // The 'request-clarification' block below forces the UI to show a message.
            
            // Let's make this conditional.
            // If the step description implies "ask user" or "show report", we show it.
            // Otherwise, we just return the artifact and let the Orchestrator decide.
            
            // Since we can't easily know the intent, let's look at the request payload.
            // If the payload has 'silent: true' or similar? No.
            
            // Let's change the behavior:
            // Always publish the artifact.
            // ONLY send 'request-clarification' if the analysis FAILED (so user knows) OR if the user explicitly asked for it.
            // But wait, if it succeeds, the Orchestrator needs to know it finished.
            
            // If we send a 'response-context' message, it goes to progress log.
            // If we send 'request-clarification', it goes to chat.
            
            // The user wants it to go to the calling agent.
            // So we should send a message directed to the sender.
            
            const responseMessage: Message = {
                kind: 'message',
                messageId: uuidv4(),
                role: 'agent',
                parts: [
                    {
                        kind: 'data',
                        mimeType: 'application/vnd.a2a+json',
                        data: {
                            status: isFailure ? 'failure' : 'success',
                            success: !isFailure, // Required for a2a_server interception
                            filePath, // Required for context
                            correlation, // Required for routing back to Orchestrator
                            analysis: generatedAnalysis,
                            result: generatedAnalysis
                        }
                    }
                ],
                contextId: requestContext.contextId,
                // If the SDK supports 'replyTo', we should use it.
                // Assuming contextId is enough for correlation.
            } as any;
            
            // Only send clarification (chat bubble) if it failed, so user can retry.
            // If it succeeded, just send the data back.
            if (isFailure) {
                // Return standard failure response so Orchestrator can auto-retry
                const errorText = generatedAnalysis.replace(/<!-- Failed to generate analysis: | -->/g, '').trim();
                const errorPayload = {
                    status: 'error',
                    success: false,
                    error: errorText,
                    errorMessage: errorText,
                    correlation,
                    artifacts: []
                };

                const errorMessage: Message = {
                    kind: 'message',
                    messageId: uuidv4(),
                    role: 'agent',
                    parts: [
                        {
                            kind: 'data',
                            mimeType: 'application/vnd.a2a+json',
                            data: {
                                toolName: sender, // Dynamic Routing
                                command: 'response-code-execution',
                                payload: errorPayload
                            }
                        }
                    ],
                    contextId: requestContext.contextId,
                } as any;
                eventBus.publish(errorMessage);

            } else {
                // Success case: Just publish the response so Orchestrator can proceed.
                // We also publish the artifact above, which is good.
                // We might want to log a progress message.
                const progressMsg: Message = {
                    kind: 'message',
                    messageId: uuidv4(),
                    role: 'agent',
                    parts: [{ kind: 'text', text: isKorean ? '분석이 완료되었습니다.' : 'Analysis completed.' }],
                    contextId: requestContext.contextId,
                    metadata: { type: 'progress' } // Mark as progress so it doesn't clutter chat
                } as any;
                eventBus.publish(progressMsg);
                
                // And the data response
                eventBus.publish(responseMessage);
            }

        } catch (e: any) {
            console.error('[CodeAnalysisAgent] Error:', e);
            // Log the error to developer logs if available (not directly accessible here, but we can console.log)
            
            const errorMessage: Message = {
                kind: "message",
                messageId: uuidv4(),
                role: "agent",
                parts: [{ kind: "text", text: `An error occurred during analysis: ${e.message}` }],
                contextId: requestContext.contextId,
            };
            eventBus.publish(errorMessage);

            try {
                const anyCtx: any = requestContext as any;
                const incoming = anyCtx?.message || anyCtx?.request?.message || anyCtx?.request || anyCtx;
                const parts = Array.isArray(incoming?.parts) ? incoming.parts : (Array.isArray(anyCtx?.parts) ? anyCtx.parts : []);
                const dataPart = parts.find((p: any) => p && p.kind === 'data' && ((p.mimeType && p.mimeType.indexOf('application/vnd.a2a+json') >= 0) || !p.mimeType));
                const corr = (dataPart?.data || {}).correlation || incoming?.task?.data?.correlation;
                const errorPayload = {
                    success: false,
                    status: 'error',
                    error: e?.message || 'Unknown error',
                    errorMessage: e?.message || 'Unknown error',
                    correlation: corr,
                    artifacts: []
                };
                const a2aError: Message = {
                    kind: 'message',
                    messageId: uuidv4(),
                    role: 'agent',
                    parts: [{
                        kind: 'data',
                        mimeType: 'application/vnd.a2a+json',
                        data: {
                            toolName: sender, // Dynamic Routing
                            command: 'response-code-execution',
                            payload: errorPayload
                        }
                    }],
                    contextId: (requestContext as any)?.contextId
                } as any;
                eventBus.publish(a2aError as any);
            } catch {}
        }
    }

    async cancelTask(): Promise<void> {
        // no-op
    }

    private getLanguageFromFilePath(filePath: string): string {
        const extension = filePath.split('.').pop()?.toLowerCase();
        switch (extension) {
            case 'js':
            case 'jsx':
                return 'javascript';
            case 'ts':
            case 'tsx':
                return 'typescript';
            case 'py':
                return 'python';
            case 'java':
                return 'java';
            case 'go':
                return 'go';
            case 'rb':
                return 'ruby';
            default:
                return 'code';
        }
    }
}
