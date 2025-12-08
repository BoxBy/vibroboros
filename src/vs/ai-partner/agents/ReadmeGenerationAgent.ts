import * as vscode from 'vscode';
import { AgentCard, Message } from "@a2a-js/sdk";
import { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from 'uuid';
import { LLMService } from '../services/LLMService';
import { getCoreLLMTools } from '../services/LLMTools';
import { getRobustToolUsePrompt } from '../prompts/sections/ToolUse';
import { ConfigService } from '../config_service';
import { getMcpClient } from "../mcp_client_provider";
import * as mcpClientModule from "@modelcontextprotocol/sdk/client";
import * as path from 'path';
import { publishProgressLog } from './utils/sdkProgressHelper';
import { runLLMLoop } from './utils/agentHelpers';

export class ReadmeGenerationAgent implements AgentExecutor {
    private llmService: LLMService;
    private configService: ConfigService;
    private mcpClient: mcpClientModule.Client;
    private static lastRunAt: number = 0;

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
            
            // Dynamic Routing
            sender = incoming?.senderName || incoming?.sender || incoming?.from || 'OrchestratorAgent';
            publishProgressLog(eventBus, `[ReadmeGenerationAgent] Request received from: ${sender}`, requestContext);

            const isBackground = incoming?.type === 'background-update';
            const parts = Array.isArray(incoming?.parts) ? incoming.parts : (Array.isArray(anyCtx?.parts) ? anyCtx.parts : []);
            const dataPart = parts.find((p: any) => p && p.kind === 'data' && ((p.mimeType && p.mimeType.indexOf('application/vnd.a2a+json') >= 0) || !p.mimeType));
            const correlation = (dataPart?.data || {}).correlation;
            // Throttle background executions to avoid rapid consecutive runs (10s)
            if (isBackground) {
                const now = Date.now();
                if (now - ReadmeGenerationAgent.lastRunAt < 10_000) {
                    return;
                }
                ReadmeGenerationAgent.lastRunAt = now;
            }
            {
                console.log('Auto-updating README.md... Gathering project context.');
            }

            const planContent = await this._readFileWithTool('PLAN.md', eventBus, requestContext);
            const progressContent = await this._readFileWithTool('PROGRESS.md', eventBus, requestContext);
            const taskContent = await this._readFileWithTool('TASK.md', eventBus, requestContext);
            const packageJsonContent = await this._readFileWithTool('package.json', eventBus, requestContext);

            // Support for contextFiles (Plan Context)
            let additionalContext = '';
            const contextFiles = (dataPart?.data as any)?.contextFiles as string[] || [];
            if (contextFiles && Array.isArray(contextFiles) && contextFiles.length > 0) {
                 const workspaceFolders = vscode.workspace.workspaceFolders;
                 const roots = Array.isArray(workspaceFolders) ? workspaceFolders.map(f => path.normalize(f.uri.fsPath)) : [];
                 const baseRoot = roots[0] || '';
                 
                for (const cf of contextFiles) {
                    if (typeof cf !== 'string') continue;

                    try {
                        let absCf = cf;
                        if (!path.isAbsolute(cf)) {
                            absCf = baseRoot ? path.join(baseRoot, cf) : cf;
                        }
                       // Read using _readFileWithTool logic (but simpler here since we have direct FS access mostly? ReadmeGenerationAgent uses _readFileWithTool which uses FileReadTool)
                       // Let's use VS Code FS directly for simplicity and speed as generally used in other agents here
                       const buf = await vscode.workspace.fs.readFile(vscode.Uri.file(absCf));
                       const content = Buffer.from(buf).toString('utf-8');
                       const ext = path.extname(absCf).replace('.', '');
                       additionalContext += `\n**File (${path.basename(cf)}):**\n\`\`\`${ext}\n${content}\n\`\`\`\n`;
                    } catch (e) {
                         console.log(`[ReadmeGenerationAgent] Failed to read context file ${cf}:`, e);
                    }
                }
            }


            const prompt = `You are generating a README.md that strictly follows the project's specified style and template.
${getRobustToolUsePrompt()}

**// CONTEXT**
- **Project Plan:**
\`\`\`
${planContent}
\`\`\`
- **Current Progress:**
\`\`\`
${progressContent}
\`\`\`
- **Key Tasks:**
\`\`\`
${taskContent}
\`\`\`
- **Package Info (\`package.json\`):**
\`\`\`json
${packageJsonContent}
\`\`\`
${additionalContext ? `- **Reference Context:**\n${additionalContext}` : ''}


**// YOUR TASK**
Generate the README.md in Markdown format that matches the provided template and the repository's existing style conventions (badges at the top, concise sections, neutral branding). Fill placeholders using the context above. Do not invent facts; if a detail is missing, keep the placeholder bracketed and minimal.

**// README.md TEMPLATE**
# [Project Name]

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Pull Requests Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

> [A short, one-sentence project description or tagline]

## 🚀 Overview

[Provide a more detailed introduction to the project. Explain the problem it solves and its main purpose. Use the Project Plan for this.]

## ✨ Features

*   [List the key features, completed or planned. Use the Progress and Task files for this.]
*   Feature B
*   Feature C

## 📦 Getting Started

### Prerequisites

[List any prerequisites needed to install and run the project, e.g., Node.js version. Infer from \`package.json\` if possible.]

### Installation

[Provide clear, step-by-step installation instructions.]

\`\`\`bash
# Clone the repository
git clone [repository_url]
cd [project_name]

# Install dependencies
npm install
\`\`\`

### Running the Project

[Provide instructions on how to run the project.]

\`\`\`bash
# Start the development server
npm start
\`\`\`

## 📚 Documentation

More detailed documentation can be found in the \`/docs\` directory:

*   **[Project Philosophy](./docs/philosophy.md):** The core principles and goals of the project.
*   **[Architecture Overview](./docs/architecture.md):** A look at the technical architecture.

## 🤝 Contributing

Contributions are welcome! Please see our [Contributing Guidelines](./CONTRIBUTING.md) for more details on how to get involved.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.

**// OUTPUT FORMAT**
1. <thinking>
Briefly explain your strategy for filling the template.
</thinking>
2. README: Output the COMPLETE README.md content inside a markdown code block.
3. CLARIFICATION: If you need more info (e.g., missing file, ambiguous goal), return ONLY a JSON object: {"request_clarification": {"question": "...", "context": "..."}}

**// RULES**
-   Output MUST be ONLY the final README.md content inside \`\`\`markdown ... \`\`\`.
-   Do NOT include any references to AI, assistants, agents, or generation process.
-   Do NOT change the section order or add new sections not present in the template.
-   Infer details like [Project Name], [repository_url], etc., from the provided context only. If unknown, keep placeholders.
`;

            console.log('Context gathered. Generating README with LLM...');

            const model = this.configService.getModel();
            const apiKeys = await this.configService.getApiKeys();
            const apiKey = apiKeys[0] || '';
            const endpoint = this.configService.getEndpoint();
            const provider = this.configService.getLlmProvider();

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

            const resp = await this.llmService.requestLLMCompletion(
                provider, messages, apiKey, endpoint, getCoreLLMTools(provider), model, onChunk
            );
                return (resp.choices[0]?.message?.content ?? (resp as any)?.choices?.[0]?.text ?? '').toString();
            };

            const parser = (text: string) => {
                // 1. Try extracting from markdown block
                const codeMatch = text.match(/```markdown\s*([\s\S]*?)```/) || text.match(/```\s*([\s\S]*?)```/);
                if (codeMatch) {
                    return codeMatch[1];
                }
                // 2. Fallback: check if it looks like markdown (headers, bullets)
                if (text.includes('# ') || text.includes('## ') || text.includes('* ')) {
                    return text;
                }
                // 3. Check for clarification JSON
                try {
                    const json = JSON.parse(text);
                    if (json.request_clarification) return json;
                } catch {}
                
                // If it's a long text, assume it's the readme
                if (text.length > 50) return text;

                throw new Error('No README found in response');
            };

            const validator = (parsed: any) => {
                if (typeof parsed === 'string') {
                    if (parsed.length < 10) { return { valid: false, error: "Generated README is too short" }; }
                    return { valid: true };
                }
                if (parsed.request_clarification) {
                    if (!parsed.request_clarification.question) { return { valid: false, error: "Missing clarification question" }; }
                    return { valid: true };
                }
                return { valid: false, error: "Output must be a string (markdown) or a clarification object" };
            };

            let generatedReadme: any;
            try {
                generatedReadme = await runLLMLoop(llmCall, parser, validator, 3);
            } catch (e: any) {
                throw new Error(`Failed to generate README: ${e.message}`);
            }

            // Handle Clarification
            try {
                const parsed = JSON.parse(generatedReadme);
                if (parsed?.request_clarification) {
                    const { question, context, options } = parsed.request_clarification;
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
            } catch {}

            const rootPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
            const readmePath = path.join(rootPath, 'README.md');

            if (isBackground) {
                // Background mode: auto-apply
                {
                    console.log('Applying README.md update (background).');
                }
                await this._writeFileWithTool(readmePath, generatedReadme, eventBus, requestContext);
                const finalMessage: Message = {
                    kind: "message",
                    messageId: uuidv4(),
                    role: "agent",
                    parts: [{ kind: "text", text: 'README.md updated (background).' }],
                    contextId: requestContext.contextId,
                };
                eventBus.publish(finalMessage as any);
            } else {
                // Foreground: propose via Orchestrator for confirmation
                // Combine final text and A2A data into a single message to avoid race conditions
                const successPayload = {
                    success: true,
                    status: 'ok',
                    needsConfirmation: true,
                    filePath: readmePath,
                    content: generatedReadme,
                    suggestionType: 'edit-file',
                    correlation,
                    artifacts: [{ type: 'file', path: readmePath, summary: 'Generated README.md content.' }]
                };

                const combinedMessage: Message = {
                    kind: 'message',
                    messageId: uuidv4(),
                    role: 'agent',
                    parts: [
                        { kind: 'text', text: 'README.md generation complete.' },
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
                    contextId: requestContext.contextId
                } as any;
                eventBus.publish(combinedMessage);
            }

        } catch (e: any) {
            const errorMessage: Message = {
                kind: "message",
                messageId: uuidv4(),
                role: "agent",
                parts: [{ kind: "text", text: `An error occurred during README generation: ${e.message}` }],
                contextId: requestContext.contextId,
            };
            eventBus.publish(errorMessage);

            // SDK Standard: A2A Error Response for Auto-Retry
            try {
                const anyCtx: any = requestContext as any;
                const incoming = anyCtx?.message || anyCtx?.request?.message || anyCtx?.request || anyCtx;
                const parts = Array.isArray(incoming?.parts) ? incoming.parts : (Array.isArray(anyCtx?.parts) ? anyCtx.parts : []);
                const dataPart = parts.find((p: any) => p && p.kind === 'data' && ((typeof p.mimeType === 'string' && p.mimeType.toLowerCase().includes('application/vnd.a2a+json')) || !p.mimeType));
                const correlation = (dataPart?.data || {}).correlation || incoming?.task?.data?.correlation;

                const errorPayload = {
                    success: false,
                    status: 'error',
                    error: e?.message || 'Unknown error',
                    errorMessage: e?.message || 'Unknown error',
                    correlation,
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
                            toolName: sender,
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
        // Add cancel task logic here
    }

    private async _readFileWithTool(fileName: string, eventBus: ExecutionEventBus, requestContext: RequestContext): Promise<string> {
        const rootPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
        if (!rootPath) {
            return `Could not find workspace root to read ${fileName}`;
        }
        const filePath = path.join(rootPath, fileName);

        try {
            const response = await this.mcpClient.callTool({
                name: 'FileReadTool',
                arguments: { filePath }
            } as any);
            // MCP Tool 응답 구조: {content: [...], structuredContent: payload}
            // FileReadTool의 payload는 {content: string}
            const content = (response as any)?.structuredContent?.content
                || ((response as any)?.content?.find?.((b: any) => b?.type === 'text')?.text)
                || '';
            return content || `File not found or empty: ${fileName}`;
        } catch (e: any) {
            publishProgressLog(eventBus, `[ReadmeGenerationAgent] Failed to read ${fileName} with FileReadTool: ${e.message}`, requestContext as any);
            return `Error reading file: ${fileName}`;
        }
    }

    private async _writeFileWithTool(filePath: string, content: string, eventBus: ExecutionEventBus, requestContext: RequestContext): Promise<void> {
        try {
            await this.mcpClient.callTool({
                name: 'FileWriteTool',
                arguments: { filePath, content }
            } as any);
        } catch (e: any) {
            publishProgressLog(eventBus, `[ReadmeGenerationAgent] Failed to write to ${filePath} with FileWriteTool: ${e.message}`, requestContext as any);
            throw new Error(`Failed to write README.md to ${filePath}.`);
        }
    }
}