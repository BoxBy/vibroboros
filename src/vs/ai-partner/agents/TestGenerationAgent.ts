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


export class TestGenerationAgent extends BaseAgent {

    constructor(card: AgentCard) {
        super(card);
    }

    protected outputFormat: 'json' | 'text' = 'text'; // TestGen returns text confirmation and tool artifacts

    // --- Unified Flow Implementation ---

    protected async getSystemPrompt(userInput: string, requestContext: RequestContext, seniorIntuition?: string): Promise<string> {
        // 1. Extract Complexity from Dual-Channel Fallback (Text)
        const complexityMatch = userInput.match(/Complexity Level (\d+)/);
        const assignedComplexity = complexityMatch ? parseInt(complexityMatch[1], 10) : 2; // Default to 2

        // 2. Base Persona (Standardized)
        // Pass explicit context options if available (resolved later, but we need prompt first? No, we can resolve path first)
        
        // Strategy: Resolve path first to pass to Factory for Smart Context
        const anyCtx = requestContext as any;
        const incoming = anyCtx?.message || anyCtx?.request?.message || anyCtx?.request || anyCtx;
        const parts = Array.isArray(incoming?.parts) ? incoming.parts : (Array.isArray(anyCtx?.parts) ? anyCtx.parts : []);
        const dataPart = parts.find((p: any) => p && p.kind === 'data');
        
        // Resolve File Path
        let filePath = (dataPart?.data || {}).filePath as string;
        if (!filePath) {
             const match = userInput.match(/\(File:\s*"([^"]+)"\)/i);
             if (match && match[1]) { filePath = match[1]; }
        }

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
        const baseSystem = await promptFactory.generate('TestGenerationAgent', 'TestGenerationAgent', assignedComplexity, finalUserInput, { targetFile: absolutePath }, seniorIntuition);
    
        if (!absolutePath) {
             return `${baseSystem}\n\n**Error**: No source file provided for test generation.`;
        }

        // 4. Read Source Code
        let code = '';
        try {
            const content = await vscode.workspace.fs.readFile(vscode.Uri.file(absolutePath));
            code = new TextDecoder().decode(content);
        } catch (e) {
            return `${baseSystem}\n\n**Error**: Could not read file ${absolutePath}.`;
        }

        // 5. Determine Framework
        const lang = this.getLanguageFromFilePath(absolutePath);
        const framework = lang === 'python' ? 'pytest' : (lang === 'java' ? 'JUnit' : 'jest/mocha');

        // 6. Construct Final Prompt
        return `${baseSystem}

**Specific Task: Unit Test Generation**
**Target File**: \`${absolutePath}\`
**Language**: ${lang}
**Framework**: ${framework}

**Instructions**:
1. Analyze the logic, edge cases, and dependencies.
2. Generate a COMPLETE test file using **${framework}**.
3. Do not assume custom mocks unless standard. Mock external deps.
4. Submit the test code using \`submit_test\`.

**Source Code**:
\`\`\`${lang}
${code}
\`\`\`
`;
    }

    protected async getTools(userInput: string, requestContext: RequestContext): Promise<any[]> {
        const { provider } = await this.getLLMConfig();
        
        const submitTestTool = {
            type: 'function',
            function: {
                name: 'submit_test',
                description: 'Submit the generated test file content.',
                parameters: {
                    type: 'object',
                    properties: {
                        content: { type: 'string', description: 'The test code.' }
                    },
                    required: ['content'],
                    additionalProperties: false
                }
            }
        };

        return [...getCoreLLMTools(provider), submitTestTool];
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

        if (!content || content.length < 10) {
            content = "// Failed to generate valid tests.";
        }

        // Re-parse path to generate filename (Code duplication but stateless)
        const anyCtx = requestContext as any;
        const incoming = anyCtx?.message || anyCtx?.request?.message || anyCtx?.request || anyCtx;
        const parts = Array.isArray(incoming?.parts) ? incoming.parts : (Array.isArray(anyCtx?.parts) ? anyCtx.parts : []);
        const dataPart = parts.find((p: any) => p && p.kind === 'data');
        let filePath = (dataPart?.data || {}).filePath as string;
        if (!filePath) {
             const userId = anyCtx?.message?.userMessage || ''; 
             const match = typeof userId === 'string' ? userId.match(/\(File:\s*"([^"]+)"\)/i) : null;
             if (match && match[1]) { filePath = match[1]; }
        }
        
        let outName = 'generated_test.spec.ts';
        if (filePath) {
            const ext = path.extname(filePath);
            const base = path.basename(filePath, ext);
            // Simple heuristic
            outName = filePath.includes('.py') ? `test_${base}.py` : `${base}.test${ext}`;
        }
        
        // Response
         const response: Message = {
            kind: 'message',
            messageId: uuidv4(),
            role: 'agent',
            parts: [{
                kind: 'data',
                mimeType: 'application/vnd.a2a+json',
                data: {
                    toolName: 'TestGenerationAgent',
                    command: 'response-code-execution',
                    payload: {
                        success: true,
                        status: 'ok',
                        needsConfirmation: true,
                        filePath: outName,
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

    private getLanguageFromFilePath(filePath: string): string {
         const extension = filePath.split('.').pop()?.toLowerCase();
         if (extension === 'py') return 'python';
         if (extension === 'java') return 'java';
         if (['ts', 'tsx'].includes(extension || '')) return 'typescript';
         return 'javascript';
    }
}