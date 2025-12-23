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

        return SystemPromptFactory.generate('BrainstormAgent', 'BrainstormAgent', assignedComplexity, finalUserInput);
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
        // Check if result is already structured A2A JSON
        let payloadData: any = {
            toolName: 'BrainstormAgent',
            command: 'response-context',
            payload: { response: result, requiresUserInput: true, correlation: correlationId }
        };

        try {
            // Clean markdown
            const jsonMatch = result.match(/```json\n([\s\S]*?)\n```/) || result.match(/```\n([\s\S]*?)\n```/) || result.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : result;
            
            const parsed = JSON.parse(jsonString);
            if (parsed && typeof parsed === 'object') {
                // If it looks like a valid A2A payload or just structured data
                if (parsed.payload || parsed.toolName) {
                     payloadData = parsed;
                } else {
                     // Just wrapped JSON data
                     payloadData.payload.response = JSON.stringify(parsed);
                }
            }
        } catch (e) {
            // Not JSON, use default text wrapper
        }

        const responseMessage: Message = {
            kind: 'message',
            messageId: uuidv4(),
            role: 'agent',
            parts: [
                { kind: 'text', text: result }, // Keep text for legacy/debugging or UI fallback
                {
                    kind: 'data',
                    mimeType: 'application/vnd.a2a+json',
                    data: payloadData
                }
            ],
            contextId: (requestContext as any)?.contextId
        } as any;
        eventBus.publish(responseMessage);
    }
}
