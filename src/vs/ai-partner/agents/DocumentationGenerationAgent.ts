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
import { publishProgressLog } from './utils/sdkProgressHelper';
import { runLLMLoop, runAgenticLoop } from './utils/agentHelpers';

export class DocumentationGenerationAgent implements AgentExecutor {
    private llmService: LLMService;
    private configService: ConfigService;
    private mcpClient: mcpClientModule.Client;

    constructor(private card: AgentCard) {
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
            publishProgressLog(eventBus, `[DocumentationGenerationAgent] Request received from: ${sender}`, requestContext);
            
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
                console.log(`[DocGen] Extracted filePath from dataPart: "${filePath}"`);
                console.log(`[DocGen] Extracted contextFiles: ${JSON.stringify(dataPart.data.contextFiles)}`);
            }
            
            // Fallback: extract from text if not in data part
            if (!filePath && nl) {
                const m = nl.match(/([A-Za-z]:\\[^\s\"']+\.[A-Za-z0-9]+|[^\s\"']+\.[A-Za-z0-9]+)/);
                if (m && m[1]) { 
                    filePath = m[1].trim(); 
                    console.log(`[DocGen] Extracted filePath from text regex: "${filePath}"`);
                }
            }
            publishProgressLog(eventBus, `[DocumentationGenerationAgent] Reading file for documentation generation: ${filePath || '(from context)'}`, requestContext);

            // Resovle within workspace and read via MCP FileReadTool (relative path)
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
            const fileContentResponse = await (this.mcpClient as any).callTool({ name: 'FileReadTool', arguments: { filePath: relativeForTool || filePath } });
            // MCP Tool 응답 구조: {content: [...], structuredContent: payload}
            // FileReadTool의 payload는 {content: string}
            let code = (fileContentResponse as any)?.structuredContent?.content
                || ((fileContentResponse as any)?.content?.find?.((b: any) => b?.type === 'text')?.text)
                || '';
            if (!code || String(code).trim().length === 0) {
                try {
                    const buf = await vscode.workspace.fs.readFile(vscode.Uri.file(absoluteCandidate));
                    code = Buffer.from(buf).toString('utf-8');
                    try { console.log('[DocumentationGenerationAgent] Fallback read via VS Code FS succeeded.'); } catch {}
                } catch {}
            }

            // Support for contextFiles (Plan Context)
            let additionalContext = '';
            const contextFiles = (dataPart?.data as any)?.contextFiles as string[] || [];
            if (contextFiles && Array.isArray(contextFiles) && contextFiles.length > 0) {
                for (const cf of contextFiles) {
                    if (typeof cf !== 'string') continue;

                    if (cf === filePath) continue; // Skip primary file
                    try {
                        // resolve cf
                        let absCf = cf;
                        if (!path.isAbsolute(cf)) {
                            absCf = baseRoot ? path.join(baseRoot, cf) : cf;
                        }
                        const buf = await vscode.workspace.fs.readFile(vscode.Uri.file(absCf));
                        const content = Buffer.from(buf).toString('utf-8');
                        const lang = this.getLanguageFromFilePath(cf);
                        additionalContext += `\n\n**Referenced File (${path.basename(cf)}):**\n\`\`\`${lang}\n${content}\n\`\`\``;
                    } catch (e) {
                        console.log(`[DocumentationGenerationAgent] Failed to read context file ${cf}:`, e);
                    }
                }
            }

            const language = this.getLanguageFromFilePath(filePath);
            const queryStr = (incoming?.task?.data?.query ?? nl ?? '').toString();

            const prompt = `
Generate developer documentation in Markdown for the given source file.
${getRobustToolUsePrompt()}
Do not include any references to AI, assistants, agents, or "Vibe". Use a neutral, professional tone and avoid first-person wording. If additional context or exact definitions are required, prefer retrieving precise source content via available MCP tools (e.g., FileReadTool for local files). Do not speculate; only incorporate verifiable content.

**Context:**

*   **File to Document:** \`${filePath}\`
*   **Language:** \`${language}\`
*   **User's Goal:** "${queryStr}"

System: You are an expert Technical Writer following the **Google Developer Documentation Style Guide**.
Your goal is to create clear, consistent, and user-focused documentation for the provided code.

**Style Guidelines (Google Style):**
1.  **Voice & Tone**: Use the **active voice** ("The function calculates...") instead of passive ("The calculation is performed by..."). Be authoritative but friendly.
2.  **Tense**: Use the **present tense** (e.g., "accepts," "returns," "throws") instead of future tense ("will accept").
3.  **Clarity**: Avoid fluff words ("basically," "simply," "just"). Be concise.
4.  **Formatting**:
    -   Use \`code font\` for all class names, methods, parameters, and string literals.
    -   Use standard Markdown headers (#, ##, ###).
    -   Capitalize parameter descriptions (e.g., "The ID of the user.").
5.  **Completeness**: Document EVERY public function, class, and constant.

**Task:**
Generate documentation for the file: \`${filePath}\`
Language: ${language}

**Requested Format:**
If the file is a source code file (python, ts, etc.), generate **API Reference** documentation.
If the file is a README or guide, generate **Narrative** documentation.

**Documentation Structure (for Code):**
# [File/Class Name]
> [Brief, one-sentence summary of what this module does]

## Overview
[Concise explanation of the module's purpose and role in the system.]

## Classes / Functions

### \`[Name]\`
[Description using active verbs]

**Parameters:**
*   \`[name]\` ([Type]): [Description starting with "The..." or "A..."]

**Returns:**
*   ([Type]): [Description of return value]

**Example:**
\`\`\`${language}
[Short, runnable example]
\`\`\`

**Output Specification:**
1. <thinking>
Briefly analyze the code structure and define the documentation strategy.
</thinking>
2. Output the COMPLETE documentation inside a single markdown code block.
3. If clarification is needed, return JSON: {"request_clarification": ...}

**Source Code:**
\`\`\`${language}
${code}
\`\`\`
${additionalContext}
            `;

            console.log('Generating documentation with LLM...');
            const model = this.configService.getModel();
            const apiKeys = await this.configService.getApiKeys();
            const apiKey = apiKeys[0] || '';
            const endpoint = this.configService.getEndpoint();
            const provider = this.configService.getLlmProvider();
            const tools = getCoreLLMTools(provider);

            const lang = (vscode.env.language || 'en').toLowerCase();
            const localeSystem = `Speak only in ${lang}.`;

            const llmCall = async (previousError?: string) => {
                const messages: any[] = [
                    { role: 'system', content: localeSystem },
                    { role: 'user', content: prompt }
                ];
                if (previousError) {
                    messages.push({ role: 'user', content: `Previous attempt failed: ${previousError}. Please try again.` });
                }
            // Streaming logic refactoring in progress
            const createStreamingCallback = () => {
                if (!this.configService.isStreamingEnabled(this.card.name)) { return undefined; }
                let buffer = '';
                let inThinkingBlock = false;
                return (chunk: string) => {
                    if (!chunk) { return; }
                    buffer += chunk;
                    
                    let output = '';
                    let i = 0;
                    
                    while (i < buffer.length) {
                        if (inThinkingBlock) {
                            const closeIdx = buffer.indexOf('</thinking>', i);
                            if (closeIdx !== -1) {
                                output += buffer.slice(i, closeIdx);
                                inThinkingBlock = false;
                                i = closeIdx + 11; 
                            } else {
                                const remaining = buffer.length - i;
                                if (remaining < 11) { break; } 
                                else {
                                    const safeEnd = buffer.length - 10;
                                    output += buffer.slice(i, safeEnd);
                                    i = safeEnd;
                                    break;
                                }
                            }
                        } else {
                            const openIdx = buffer.indexOf('<thinking>', i);
                            if (openIdx !== -1) {
                                inThinkingBlock = true;
                                i = openIdx + 10; 
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
                                const remaining = buffer.length - i;
                                if (remaining < 10) { break; } 
                                else {
                                    const safeEnd = buffer.length - 9;
                                    i = safeEnd;
                                    break;
                                }
                            }
                        }
                    }
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
                };
            };
            const stream = this.configService.isStreamingEnabled(this.card.name);
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
                                message: '> ',
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

                return await runAgenticLoop({
                    llmService: this.llmService,
                    provider,
                    messages,
                    apiKey,
                    endpoint,
                    tools,
                    model,
                    mcpClient: this.mcpClient,
                    maxTurns: 10,
                    onStreamingData: createStreamingCallback(),
                    logger: undefined
                });
            };

            const parser = (text: string) => {
                // Pre-processing: Strip thinking tags to avoid false positives/negatives
                const cleanText = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
                
                // Debug log
                console.log(`[DocumentationGenerationAgent] Raw response length: ${text.length}, Clean text length: ${cleanText.length}`);

                // 1. Try extracting from markdown block
                const codeMatch = cleanText.match(/```markdown\s*([\s\S]*?)```/) || cleanText.match(/```\s*([\s\S]*?)```/);
                if (codeMatch) { return codeMatch[1]; }
                
                // 2. Fallback: Check for headers/bullets
                if (cleanText.includes('# ') || cleanText.includes('## ') || cleanText.includes('* ') || cleanText.includes('- ')) {
                    return cleanText;
                }
                
                // 3. Check for clarification JSON
                try {
                    const json = JSON.parse(cleanText);
                    if (json.request_clarification) return json;
                } catch {}
                
                // 4. Relaxed Fallback: If cleanText is substantial, use it
                if (cleanText.length > 20) return cleanText;

                // 5. Deep Fallback: If cleanText is empty but we have Raw Text (e.g. only thinking tags),
                // return the raw text (or extracted thinking) to avoid a crash.
                if (text.length > 0) {
                     const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/i);
                     if (thinkingMatch) {
                         return `> **AI Thought Process:**\n${thinkingMatch[1].trim()}`;
                     }
                     return text; // Absolute fallback
                }

                throw new Error(`No documentation found in response (Length: ${text.length})`);
            };

            const validator = (parsed: any) => {
                if (typeof parsed === 'string') {
                    if (parsed.length < 10) { return { valid: false, error: "Generated documentation is too short" }; }
                    return { valid: true };
                }
                if (parsed.request_clarification) {
                    if (!parsed.request_clarification.question) { return { valid: false, error: "Missing clarification question" }; }
                    return { valid: true };
                }
                return { valid: false, error: "Output must be a string (markdown) or a clarification object" };
            };

            let generatedDocs: any;
            try {
                generatedDocs = await runLLMLoop(llmCall, parser, validator, 3);
            } catch (e: any) {
                generatedDocs = `<!-- Failed to generate documentation: ${e.message} -->`;
            }

            // Handle Clarification
            if (typeof generatedDocs !== 'string' && generatedDocs?.request_clarification) {
                const { question, context, options } = generatedDocs.request_clarification;
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

            if (typeof generatedDocs !== 'string') {
                 generatedDocs = '<!-- No documentation generated -->';
            }

            const artifact: any = {
                kind: 'artifact',
                artifactId: uuidv4(),
                mimeType: 'text/markdown',
                data: generatedDocs,
                description: `Generated documentation for ${filePath}`
            };
            eventBus.publish(artifact as any);

            // Decide output docs path: /docs/<basename>.md
            const baseName = filePath ? path.basename(filePath, path.extname(filePath)) : 'DOCUMENT';
            const rootPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
            const docsDir = rootPath ? path.join(rootPath, 'docs') : 'docs';
            const docsPath = path.join(docsDir, `${baseName}.md`);
            console.log(`[DocGen] Calculated output paths -> filePath: "${filePath}", baseName: "${baseName}", docsPath: "${docsPath}"`);


            // Propose a new docs file back to Orchestrator for confirmation
            const successPayload = {
                success: true,
                status: 'ok',
                needsConfirmation: true,
                filePath: docsPath,
                content: generatedDocs,
                suggestionType: 'create-file',
                correlation,
                artifacts: [{ type: 'file', path: docsPath, summary: `Generated documentation for ${filePath}` }]
            };

            // Combine text and data into a single atomic message to prevent race conditions
            const combinedMessage: Message = {
                kind: 'message',
                messageId: uuidv4(),
                role: 'agent',
                parts: [
                    { kind: "text", text: `Documentation has been generated. Suggested path: ${docsPath}` },
                    {
                        kind: 'data',
                        mimeType: 'application/vnd.a2a+json',
                        data: {
                            toolName: sender, // Dynamic Routing
                            command: 'response-code-execution',
                            payload: successPayload
                        }
                    }
                ],
                contextId: (requestContext as any)?.contextId
            } as any;
            
            try { console.log('[DocumentationGenerationAgent] publishing combined response to OrchestratorAgent', { hasCorrelation: !!correlation, filePath: docsPath, len: (generatedDocs || '').length }); } catch {}
            eventBus.publish(combinedMessage as any);

        } catch (e: any) {
            const errorMessage: Message = {
                kind: "message",
                messageId: uuidv4(),
                role: "agent",
                parts: [{ kind: "text", text: `An error occurred during documentation generation: ${e.message}` }],
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
                try { console.log('[DocumentationGenerationAgent] publishing A2A ERROR to OrchestratorAgent'); } catch {}
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
