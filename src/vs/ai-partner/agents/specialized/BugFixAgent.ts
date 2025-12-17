import * as vscode from 'vscode';
import { AgentCard, Message } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from 'uuid';
import { BaseAgent } from '../core/BaseAgent';
import { SystemPromptFactory } from "../../services/SystemPromptFactory";
import { getCoreLLMTools } from '../../services/LLMTools';

export class BugFixAgent extends BaseAgent {

    constructor(card: AgentCard) {
        super(card);
    }

    protected async getSystemPrompt(userInput: string, requestContext: RequestContext): Promise<string> {
        // Generate base prompt from Factory
        // Now using specialized 'BugFixAgent' role which includes all logic
        return SystemPromptFactory.generate('BugFixAgent', 'BugFixAgent', 60, userInput);
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
        const msg: Message = {
            kind: 'message',
            messageId: uuidv4(),
            role: 'agent',
            parts: [{ kind: 'text', text: result }],
            contextId: (requestContext as any).contextId
        };
        (eventBus as any).publish(msg);
    }

    public async cancelTask(): Promise<void> {}
}
