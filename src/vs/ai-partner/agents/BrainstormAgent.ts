import { SystemPromptFactory } from '../services/SystemPromptFactory';
import { AgentCard, Message } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from 'uuid';
import { getCoreLLMTools } from '../services/LLMTools';
import { BaseAgent } from './core/BaseAgent';

export class BrainstormAgent extends BaseAgent {

    constructor(card: AgentCard, _state: any) { // Keep state to avoid breaking signature, but type as any/unused
        super(card);
        console.log(`BrainstormAgent initialized with card: ${this.card.name}`);
    }

    protected async getSystemPrompt(userInput: string, requestContext: RequestContext): Promise<string> {
        const complexityMatch = userInput.match(/Complexity Level (\d+)/);
        const assignedComplexity = complexityMatch ? parseInt(complexityMatch[1], 10) : 80;

        return SystemPromptFactory.generate('BrainstormAgent', 'BrainstormAgent', assignedComplexity, userInput);
    }

    protected async getTools(userInput: string, requestContext: RequestContext): Promise<any[]> {
        const { provider } = await this.getLLMConfig();
        
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
            console.error('[BrainstormAgent] Failed to load MCP tools:', e);
        }

        return [...getCoreLLMTools(provider), ...dynamicMcpTools];
    }

    public async cancelTask(): Promise<void> {}

    protected async handleExecutionResult(result: string, requestContext: RequestContext, eventBus: ExecutionEventBus, correlationId?: string): Promise<void> {
        const responseMessage: Message = {
            kind: 'message',
            messageId: uuidv4(),
            role: 'agent',
            parts: [
                { kind: 'text', text: result },
                {
                    kind: 'data',
                    mimeType: 'application/vnd.a2a+json',
                    data: {
                        toolName: 'BrainstormAgent',
                        command: 'response-context',
                        payload: { response: result, requiresUserInput: true, correlation: correlationId }
                    }
                }
            ],
            contextId: (requestContext as any)?.contextId
        } as any;
        eventBus.publish(responseMessage);
    }
}
