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

        return SystemPromptFactory.getInstance().generate('BrainstormAgent', 'BrainstormAgent', assignedComplexity, finalUserInput);
    }

    protected async getTools(userInput: string, requestContext: RequestContext): Promise<any[]> {
        const { provider } = await this.getLLMConfig();
        
        const submitPlanTool = {
            type: 'function',
            function: {
                name: 'submit_plan',
                description: 'Submit the execution plan generated from brainstorming.',
                parameters: {
                    type: 'object',
                    properties: {
                        steps: { 
                            type: 'array', 
                            items: {
                                type: 'object',
                                properties: {
                                    description: { type: 'string', description: 'The step description' }
                                },
                                required: ['description']
                            },
                            description: 'Sequential steps representing the execution plan.'
                        }
                    },
                    required: ['steps'],
                    additionalProperties: false
                }
            }
        };

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

        return [...getCoreLLMTools(provider), submitPlanTool, ...dynamicMcpTools];
    }

    protected async handleCustomTool(name: string, args: any): Promise<any | undefined> {
        if (name === 'submit_plan') {
            // Wait for handleExecutionResult or dispatch directly
            return JSON.stringify({ success: true, message: "Plan submitted via tool call." });
        }
        return undefined;
    }

    public async cancelTask(): Promise<void> {}

    protected async handleExecutionResult(result: string, requestContext: RequestContext, eventBus: ExecutionEventBus, correlationId?: string): Promise<void> {
        // Since we are using strictly typed tools (`submit_plan`),
        // we extract the tool call context or rely on the tool execution loop in runAgenticLoop.
        // If the LLM just outputs raw text without calling the tool, we present it as text message.
        // We need to parse result here *if* the LLM tool call wrapper passes JSON back as a result string, 
        // OR we intercept it in `onLoopComplete` (if we tracked the tool arguments).
        
        let payloadData: any = null;

        try {
            // Attempt strict parsing first (if the result holds JSON directly like from OpenAI SDK output)
            const parsed = JSON.parse(result);
            if (parsed && typeof parsed === 'object') {
                if (parsed.steps && Array.isArray(parsed.steps)) {
                    // It's the `submit_plan` payload!
                    payloadData = {
                        toolName: 'BrainstormAgent',
                        command: 'response-context',
                        payload: { response: result, requiresUserInput: true, correlation: correlationId }
                    };
                } else if (parsed.payload || parsed.toolName) {
                    payloadData = parsed;
                }
            }
        } catch (e) {
            // LLM didn't return strict JSON as final result.
        }

        if (payloadData) {
            const responseMessage: Message = {
                kind: 'message',
                messageId: uuidv4(),
                role: 'agent',
                parts: [
                    {
                        kind: 'data',
                        mimeType: 'application/vnd.a2a+json',
                        data: payloadData
                    }
                ],
                contextId: (requestContext as any)?.contextId
            } as any;
            eventBus.publish(responseMessage);
        } else if (result.trim()) {
            // Text fallback for generic chat
            eventBus.publish({ 
                kind: 'message', 
                messageId: uuidv4(), 
                role: 'agent', 
                parts: [{ kind: 'text', text: result }], 
                contextId: (requestContext as any).contextId 
            } as any);
        }
    }

    protected async onLoopComplete(messages: any[]): Promise<void> {
        // Intercept tool calls in history to fire off UI updates (as a robust fallback
        // in case final result doesn't encode the full tool args).
        for (const msg of messages) {
            if (msg.role === 'assistant' && msg.tool_calls) {
                for (const tc of msg.tool_calls) {
                    if (tc.function.name === 'submit_plan') {
                         try {
                             const args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
                             if (args?.steps) {
                                 // We found a valid plan. Let handleExecutionResult handle it by modifying the loop's final result if needed,
                                 // or we just let it ride, but actually runAgenticLoop returns the string context. Let's just safely rely on runAgenticLoop string serialization for now, or emit directly here:
                                 
                                 // No direct emit here to avoid duplicate UI events, handled by handleExecutionResult wrapper.
                             }
                         } catch (e) {}
                    }
                }
            }
        }
    }
}
