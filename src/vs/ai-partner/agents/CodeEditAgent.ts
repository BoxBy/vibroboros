import { SystemPromptFactory } from '../services/SystemPromptFactory';
import * as vscode from 'vscode';
import * as path from 'path';
import { AgentCard, Message } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from 'uuid';
import { getCoreLLMTools } from '../services/LLMTools';
import { BaseAgent } from './core/BaseAgent';
import { ConfigService } from '../config_service';


export class CodeEditAgent extends BaseAgent {

    constructor(card: AgentCard) {
        super(card);
    }

    // --- Unified Flow Implementation ---

    protected async getSystemPrompt(userInput: string, requestContext: RequestContext): Promise<string> {
        // 1. Extract Complexity
        const complexityMatch = userInput.match(/Complexity Level (\d+)/);
        const assignedComplexity = complexityMatch ? parseInt(complexityMatch[1], 10) : 2;

        // 2. Generate Base Prompt (Factory now includes Delegation instructions for 'worker')
        // 2. Generate Base Prompt (Factory now includes Delegation instructions for 'worker')
        const anyCtx = requestContext as any;
        // Data is deeply nested: request.message.parts[data].data.payload... or simplifed in extractContext
        // We look for 'targetFile' and 'relatedFiles' in the message data part payload.
        
        let targetFile: string | undefined;
        let relatedFiles: string[] | undefined;
        
        const incoming = anyCtx?.message || anyCtx?.request?.message || anyCtx;
        const parts = Array.isArray(incoming?.parts) ? incoming.parts : [];
        const dataPart = parts.find((p: any) => p?.kind === 'data');
        if (dataPart?.data) {
             targetFile = dataPart.data.targetFile || dataPart.data.payload?.targetFile;
             relatedFiles = dataPart.data.relatedFiles || dataPart.data.payload?.relatedFiles;
        }

        const basePrompt = await SystemPromptFactory.generate('CodeEditAgent', 'CodeEditAgent', assignedComplexity, userInput, { targetFile, relatedFiles });

        // 3. Return Full Prompt
        return basePrompt;
    }


    protected async getTools(userInput: string, requestContext: RequestContext): Promise<any[]> {
        const { provider } = await this.getLLMConfig();
        
        // Fetch Dynamic MCP Tools
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
        } catch (e) {}

        return [...getCoreLLMTools(provider), ...dynamicMcpTools];
    }

    protected async handleExecutionResult(result: string, requestContext: RequestContext, eventBus: ExecutionEventBus, correlationId?: string): Promise<void> {
        // Standard Output Handling: Just report the text result.
        // File actions are handled during the loop via 'create_file' or MCP tools.
        const msg: Message = {
            kind: 'message',
            messageId: uuidv4(),
            role: 'agent',
            parts: [{ kind: 'text', text: result }],
            contextId: (requestContext as any)?.contextId
        } as any;
        eventBus.publish(msg as any);
    }
}
