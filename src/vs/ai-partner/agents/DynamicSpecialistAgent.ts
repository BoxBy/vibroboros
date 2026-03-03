import { SystemPromptFactory } from '../services/SystemPromptFactory';
import * as vscode from 'vscode';
import { AgentCard, Message } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from 'uuid';
import { getCoreLLMTools } from '../services/LLMTools';
import { BaseAgent } from './core/BaseAgent';

export interface DynamicAgentParams {
    roleName: string;
    description: string;
    roleInstruction: string;
    requiredTools: string[];
}

export class DynamicSpecialistAgent extends BaseAgent {
    private dynamicParams: DynamicAgentParams;

    constructor(card: AgentCard, dynamicParams: DynamicAgentParams) {
        super(card);
        this.dynamicParams = dynamicParams;
    }

    protected async getSystemPrompt(userInput: string, requestContext: RequestContext): Promise<string> {
        // Evaluate dynamic complexity (handled within SystemPromptFactory if userInput provided)
        const basePrompt = await SystemPromptFactory.generateWithOptions({
            role: 'worker', 
            agentName: this.dynamicParams.roleName, 
            userInput: userInput,
            contextOptions: {
                dynamicRules: [this.dynamicParams.roleInstruction]
            }
        });

        // The factory handles appending context, memory, tools and other strict framework guidelines
        return basePrompt;
    }

    protected async getTools(userInput: string, requestContext: RequestContext): Promise<any[]> {
        const { provider } = await this.getLLMConfig();
        
        // Fetch Dynamic MCP Tools
        let dynamicMcpTools: any[] = [];
        try {
            const mcpList = await this.mcpClient.listTools();
            if (mcpList && mcpList.tools) {
                // Filter dynamic tools only to the ones listed in requiredTools
                dynamicMcpTools = mcpList.tools
                    .filter((t: any) => this.dynamicParams.requiredTools.includes(t.name))
                    .map((t: any) => ({
                    type: 'function',
                    function: {
                        name: t.name,
                        description: t.description || '',
                        parameters: t.inputSchema || {}
                    }
                }));
            }
        } catch (e) {}

        return [...getCoreLLMTools(provider), ...dynamicMcpTools];
    }

    protected async handleExecutionResult(result: string, requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
        // Output plain string text
        let parts: any[] = [];
        try {
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
            contextId: (requestContext as any)?.contextId
        } as any;
        eventBus.publish(msg as any);
    }

    public async cancelTask(): Promise<void> {
        return Promise.resolve();
    }
}
