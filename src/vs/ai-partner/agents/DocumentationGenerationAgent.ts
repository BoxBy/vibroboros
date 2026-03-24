import { CompositionRoot, ServiceIdentifiers } from '../di/CompositionRoot';
import { ISystemPromptFactory } from '../di/interfaces/ISystemPromptFactory';
import * as vscode from 'vscode';
import * as path from 'path';
import { AgentCard, Message } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from 'uuid';
import { getCoreLLMTools } from '../services/LLMTools';
import { BaseAgent } from './core/BaseAgent';
import { TextDecoder } from 'util';


export class DocumentationGenerationAgent extends BaseAgent {

    constructor(card: AgentCard) {
        super(card);
    }

    // --- Unified Flow Implementation ---

    protected async getSystemPrompt(userInput: string, requestContext: RequestContext, seniorIntuition?: string): Promise<string> {
        // 1. Extract Complexity from Dual-Channel Fallback (Text)
        const complexityMatch = userInput.match(/Complexity Level (\d+)/);
        const assignedComplexity = complexityMatch ? parseInt(complexityMatch[1], 10) : 2; // Default to 2

        // 5. Extract File Path (Context Strategy)
        const anyCtx = requestContext as any;
        const incoming = anyCtx?.message || anyCtx?.request?.message || anyCtx?.request || anyCtx;
        
        // Try to get data part
        const parts = Array.isArray(incoming?.parts) ? incoming.parts : (Array.isArray(anyCtx?.parts) ? anyCtx.parts : []);
        const dataPart = parts.find((p: any) => p && p.kind === 'data');
        let filePath = (dataPart?.data || {}).filePath as string;
        
        // Fallback: extract from text
        if (!filePath) {
             const match = userInput.match(/\(File:\s*"([^"]+)"\)/i);
             if (match && match[1]) { filePath = match[1]; }
        }

        // 6. Base Persona via Factory with Context
        // Workspace resolution
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const baseRoot = workspaceFolders ? workspaceFolders[0].uri.fsPath : '';
        const absolutePath = filePath ? (path.isAbsolute(filePath) ? filePath : path.resolve(baseRoot, filePath)) : '';


        let finalUserInput = userInput;
        if (dataPart?.data?.payload) {
             const payload = dataPart.data.payload;
             if (Object.keys(payload).length > 0) {
                 finalUserInput = JSON.stringify(payload, null, 2);
             }
        }
        const promptFactory = CompositionRoot.resolve<ISystemPromptFactory>(ServiceIdentifiers.SystemPromptFactory);
        const baseSystem = await promptFactory.generate('DocumentationGenerationAgent', 'DocumentationGenerationAgent', assignedComplexity, finalUserInput, { targetFile: absolutePath }, seniorIntuition);

        if (!absolutePath) {
            return `${baseSystem}\n\n**Specific Instruction**: The user wants documentation but I cannot determine the target file. Ask the user to provide the file path.`;
        }

        // 7. Read File Content
        let code = '';
        try {
            const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(absolutePath));
            code = new TextDecoder().decode(fileContent);
        } catch (e) {
            return `${baseSystem}\n\n**Error**: Could not read file ${absolutePath}. Inform the user.`;
        }
        
        // 8. Construct Final Prompt
        const basename = path.basename(absolutePath);
        return `${baseSystem}

**Specific Task: Component Documentation**
**Target File**: \`${basename}\`

**Instructions**:
1. Analyze the source code below.
2. Produce comprehensive documentation in Markdown format.
3. Call the \`submit_documentation\` tool with the result.

**Source Code**:
\`\`\`typescript
${code.slice(0, 10000)}
\`\`\`
`;
    }

    protected async getTools(userInput: string, requestContext: RequestContext): Promise<any[]> {
        const { provider } = await this.getLLMConfig();
        
        const submitDocTool = {
            type: 'function',
            function: {
                name: 'submit_documentation',
                description: 'Submit the generated documentation.',
                parameters: {
                    type: 'object',
                    properties: {
                        content: { type: 'string', description: 'The markdown documentation content.' },
                        filePath: { type: 'string', description: 'The path of the documented file (optional).' }
                    },
                    required: ['content'],
                    additionalProperties: false
                }
            }
        };

        return [...getCoreLLMTools(provider), submitDocTool];
    }

    protected async handleExecutionResult(result: string, requestContext: RequestContext, eventBus: ExecutionEventBus, correlationId?: string): Promise<void> {
        let content = '';
        try {
            // Clean markdown
            const jsonMatch = result.match(/```json\n([\s\S]*?)\n```/) || result.match(/```\n([\s\S]*?)\n```/) || result.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : result;
            
            const parsed = JSON.parse(jsonString);
            content = parsed.content || parsed;
        } catch {
            content = result;
        }

        if (!content) {
            this.publishA2AError(eventBus, 'Failed to generate documentation (empty result).', correlationId);
            return;
        }

        // We assume the caller (Orchestrator) handles the UI for "File Card" or we send a response-code-execution pretending to be a file creation?
        // Legacy returned `successPayload` with `suggestionType: 'create-file'` for a new `DOC.md` or similar?
        // Actually, let's look at legacy behavior: it created a `Blob` artifact and sent `response-code-execution` with `suggestionType: 'create-file'`.
        
        // Let's replicate that.
        // We need the original file path to determine output name.
        // We can re-extract it or pass it via correlation? 
        // For now, let's assume `content` is good.
        // We need a path. 
        // Let's default to `docs/File.md` or `File.doc.md`.
        
        // Artifact
        const artifact: any = {
            kind: 'artifact',
            artifactId: uuidv4(),
            mimeType: 'text/markdown',
            data: content,
            description: 'Generated Documentation'
        };
        eventBus.publish(artifact);

        // Response
        const response: Message = {
            kind: 'message',
            messageId: uuidv4(),
            role: 'agent',
            parts: [{
                kind: 'data',
                mimeType: 'application/vnd.a2a+json',
                data: {
                    toolName: 'DocumentationGenerationAgent',
                    command: 'response-code-execution',
                    payload: {
                        success: true,
                        status: 'ok',
                        needsConfirmation: true,
                        filePath: 'documentation.md', // Placeholder, user can rename in UI
                        content: content,
                        suggestionType: 'create-file',
                        correlation: correlationId
                    }
                }
            }],
            contextId: (requestContext as any)?.contextId
        } as any;
        eventBus.publish(response);
    }

    public async cancelTask(): Promise<void> {
        // No-op
    }
}
