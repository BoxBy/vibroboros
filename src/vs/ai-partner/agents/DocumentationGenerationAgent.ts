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

**Input Configuration:**
*   **Source File**: \`${filePath}\`
*   **Target Language**: \`${language}\`
*   **User Intent**: "${queryStr}"

System: You are an expert Technical Writer following the **Google Developer Documentation Style Guide**.
Your goal is to create clear, consistent, and user-focused documentation for the provided code.

**Output Requirement (Target File):**
You must generate a documentation file derived from the provided Source File.

**Naming Strategy:**
The Target File's name must be inferred from the Source File:
1.  **Test Files**: If the Source File is a test (e.g., \`test_user.py\`, \`auth.spec.ts\`), the Target File must document the *subject* of the test (e.g., \`user.md\`, \`auth.md\`).
2.  **Implementation Files**: Use the base name directly (e.g., \`utils.ts\` -> \`utils.md\`).

**Output Format:**
Return a single JSON object:
\`\`\`json
{
  "filename": "suggested_filename.md",
  "content": "# Documentation Content..."
}
\`\`\`
If clarification is needed, return: \`{ "request_clarification": { ... } }\`

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

            // 1. Generate English Documentation (Primary)
            console.log('Generating documentation with LLM...');
            const model = this.configService.getModel();
            const apiKeys = await this.configService.getApiKeys();
            const apiKey = apiKeys[0] || '';
            const endpoint = this.configService.getEndpoint();
            const provider = this.configService.getLlmProvider();
            const tools = getCoreLLMTools(provider);

            // Always generate in English first for consistency
            const sysLang = 'en'; 
            const localeSystem = `Speak only in ${sysLang}.`;

            const llmCall = async (previousError?: string) => {
                const messages: any[] = [
                    { role: 'system', content: localeSystem },
                    { role: 'user', content: prompt }
                ];
                if (previousError) {
                    messages.push({ role: 'user', content: `Previous attempt failed: ${previousError}. Please try again.` });
                }
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
                let cleanText = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
                // Try extracting JSON from markdown block
                const jsonMatch = cleanText.match(/```json\s*([\s\S]*?)```/) || cleanText.match(/```\s*([\s\S]*?)```/);
                if (jsonMatch) { cleanText = jsonMatch[1]; }
                
                try {
                    const parsed = JSON.parse(cleanText);
                    return parsed;
                } catch (e: any) {
                     // Fallback: if it looks like markdown, wrap it (legacy support if LLM fails JSON instruction)
                     if (cleanText.includes('# ')) {
                         // Default filename if fallback occurs
                         const fallbackName = filePath ? path.basename(filePath, path.extname(filePath)) + '.md' : 'DOCUMENT.md';
                         return { filename: fallbackName, content: cleanText };
                     }
                    throw new Error(`Failed to parse JSON response: ${e.message}`);
                }
            };

            const validator = (parsed: any) => {
                if (parsed?.request_clarification) return { valid: true };
                if (parsed?.content && typeof parsed.content === 'string') {
                    if (parsed.content.length < 10) return { valid: false, error: "Content too short" };
                    if (parsed.filename && typeof parsed.filename === 'string') return { valid: true };
                    return { valid: false, error: "Missing filename" };
                }
                return { valid: false, error: "Invalid JSON structure. Expected { filename, content }" };
            };

            let generatedDocs: any;
            try {
                generatedDocs = await runLLMLoop(llmCall, parser, validator, 3);
            } catch (e: any) {
                generatedDocs = { content: `<!-- Failed to generate documentation: ${e.message} -->`, filename: 'error.md' };
            }

            // Handle Clarification
            if (generatedDocs?.request_clarification) {
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

            // Extract content and filename
            // generatedDocs is now expected to be { filename: string, content: string } based on new validator
            const finalContent = generatedDocs.content || '<!-- No content -->';
            
            // Fallback logic if LLM didn't return filename (or error occurred)
            const fallbackBaseName = filePath ? path.basename(filePath, path.extname(filePath)) : 'DOCUMENT';
            const finalFilename = generatedDocs.filename || `${fallbackBaseName}.md`;
            
            // Remove extension from finalFilename to get base for localization
            const enBaseName = path.basename(finalFilename, path.extname(finalFilename));

            // --- LOCALIZATION & FILE PREPARATION ---
            
            const rootPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
            const docsDir = rootPath ? path.join(rootPath, 'docs') : 'docs';
            
            // Note: Regex logic for stripping 'test_' is REMOVED in favor of LLM providing the filename.
            
            const filesToCreate: any[] = [];
            const artifacts: any[] = [];
            
            // 1. English (Default)
            // Filename: <finalFilename>
            const enDocsPath = path.join(docsDir, finalFilename);
            filesToCreate.push({ filePath: enDocsPath, content: finalContent, suggestionType: 'create-file' });
            artifacts.push({ type: 'file', path: enDocsPath, summary: `Generated documentation for ${filePath}` });

            // 2. Localized (if applicable)
            const userLang = vscode.env.language || 'en';
            if (userLang !== 'en' && userLang !== 'en-us') {
                console.log(`[DocGen] Generating localized documentation for ${userLang}...`);
                const localizedPrompt = `
                You are a professional technical translator.
                Translate the following Markdown documentation into "${userLang}" (locale).
                
                Rules:
                1. Keep all code blocks, variable names, class names, and technical terms intact (do not translate code).
                2. Translate descriptions, comments, and narrative text naturally.
                3. Maintain the original Markdown structure.
                4. Output ONLY the translated markdown content.
                
                Content to Translate:
                ${finalContent}
                `;
                
                try {
                    const translationResponse = await this.llmService.requestLLMCompletion(
                        provider,
                        [{ role: 'system', content: 'You are a translator.' }, { role: 'user', content: localizedPrompt }],
                        apiKey,
                        endpoint,
                        [],
                        model,
                        undefined,
                        60000 
                    );
                    let localizedContent = (translationResponse.choices?.[0]?.message?.content ?? '').toString();
                    localizedContent = localizedContent.replace(/```markdown\s*/g, '').replace(/```\s*$/g, '').trim();

                    if (localizedContent && localizedContent.length > 50) {
                        const locDocsPath = path.join(docsDir, `${enBaseName}_${userLang}.md`);
                        filesToCreate.push({ filePath: locDocsPath, content: localizedContent, suggestionType: 'create-file' });
                        artifacts.push({ type: 'file', path: locDocsPath, summary: `Localized documentation (${userLang}) for ${filePath}` });
                        console.log(`[DocGen] Localized doc ready: ${locDocsPath}`);
                    }
                } catch (e: any) {
                    console.log(`[DocGen] Localization failed: ${e.message}`);
                }
            }

            // Publish Artifact (Legacy, might only support one, keeping first one primarily but we send via payload)
            // We'll publish the English one as the main artifact event for now, or maybe generic
            const primaryArtifact: any = {
                kind: 'artifact',
                artifactId: uuidv4(),
                mimeType: 'text/markdown',
                data: finalContent,
                description: `Generated documentation for ${filePath}`
            };
            eventBus.publish(primaryArtifact as any);

            // Propose files
            const successPayload = {
                success: true,
                status: 'ok',
                needsConfirmation: true,
                files: filesToCreate, // NEW: Multiple files support
                filePath: enDocsPath, // Legacy fallback
                content: finalContent, // Legacy fallback
                suggestionType: 'create-file',
                correlation,
                artifacts
            };

            const combinedMessage: Message = {
                kind: 'message',
                messageId: uuidv4(),
                role: 'agent',
                parts: [
                    { kind: "text", text: `Documentation generated (${filesToCreate.map(f => path.basename(f.filePath)).join(', ')}). path: ${enDocsPath}` },
                    {
                        kind: 'data',
                        mimeType: 'application/vnd.a2a+json',
                        data: {
                            toolName: sender,
                            command: 'response-code-execution',
                            payload: successPayload
                        }
                    }
                ],
                contextId: (requestContext as any)?.contextId
            } as any;
            
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
