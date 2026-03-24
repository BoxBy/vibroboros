import * as vscode from 'vscode';
import { AgentCard, Message } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from 'uuid';
import { BaseAgent } from '../core/BaseAgent';
import { CompositionRoot, ServiceIdentifiers } from '../../di/CompositionRoot';
import { ISystemPromptFactory } from '../../di/interfaces/ISystemPromptFactory';
import { getCoreLLMTools } from '../../services/LLMTools';

export class BugFixAgent extends BaseAgent {

    constructor(card: AgentCard) {
        super(card);
    }

    protected async getSystemPrompt(userInput: string, requestContext: RequestContext, seniorIntuition?: string): Promise<string> {
        // Generate base prompt from Factory
        // Now using specialized 'BugFixAgent' role which includes all logic

        const anyCtx = requestContext as any;
        const incoming = anyCtx?.message || anyCtx?.request?.message || anyCtx;
        const parts = Array.isArray(incoming?.parts) ? incoming.parts : [];
        const dataPart = parts.find((p: any) => p?.kind === 'data');
        
        let finalUserInput = userInput;
        if (dataPart?.data?.payload) {
             const payload = dataPart.data.payload;
             if (Object.keys(payload).length > 0) {
                 finalUserInput = JSON.stringify(payload, null, 2);
             }
        }
        const promptFactory = CompositionRoot.resolve<ISystemPromptFactory>(ServiceIdentifiers.SystemPromptFactory);
        return promptFactory.generate('BugFixAgent', 'BugFixAgent', 60, finalUserInput, undefined, seniorIntuition);
    }

    protected async getTools(userInput: string, requestContext: RequestContext): Promise<any[]> {
        const { provider } = await this.getLLMConfig();
        
        // Fetch Dynamic MCP Tools (Required for file editing tools like replace_file_content)
        let dynamicMcpTools: any[] = [];
        try {
            const mcpList = await this.mcpClient.listTools();
            if (mcpList && mcpList.tools) {
                dynamicMcpTools = mcpList.tools.map((t: any) => ({
                    type: 'function',
                    function: {
                        name: t.name,
                        description: t.description || '',
                        parameters: t.inputSchema || {}
                    }
                }));
            }
        } catch (e) {
            console.error('[BugFixAgent] Failed to load MCP tools:', e);
        }

        return [...getCoreLLMTools(provider), ...dynamicMcpTools];
    }

    protected async handleExecutionResult(result: string, requestContext: RequestContext, eventBus: ExecutionEventBus, correlationId?: string): Promise<void> {
        // Standard Output Handling
        // Parse Result to detect A2A envelope
        let parts: any[] = [];
        try {
            // Clean markdown
            const jsonMatch = result.match(/```json\n([\s\S]*?)\n```/) || result.match(/```\n([\s\S]*?)\n```/) || result.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : result;
            
            const parsed = JSON.parse(jsonString);
            if (parsed && typeof parsed === 'object') {
                 parts.push({
                    kind: 'data',
                    mimeType: 'application/vnd.a2a+json',
                    data: parsed
                 });
            } else {
                 parts.push({ kind: 'text', text: result });
            }
        } catch (e) {
            parts.push({ kind: 'text', text: result });
        }

        const msg: Message = {
            kind: 'message',
            messageId: uuidv4(),
            role: 'agent',
            parts: parts,
            contextId: (requestContext as any).contextId
        };
        (eventBus as any).publish(msg);
    }

    public async cancelTask(): Promise<void> {}
}
