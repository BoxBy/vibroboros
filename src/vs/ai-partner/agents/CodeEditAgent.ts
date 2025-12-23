
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

        // 2. Extract Context and Payload
        const anyCtx = requestContext as any;
        const incoming = anyCtx?.message || anyCtx?.request?.message || anyCtx;
        const parts = Array.isArray(incoming?.parts) ? incoming.parts : [];
        const dataPart = parts.find((p: any) => p?.kind === 'data');
        
        let targetFile: string | undefined;
        let relatedFiles: string[] | undefined;
        let finalUserInput = userInput;

        if (dataPart?.data) {
             const payload = dataPart.data.payload || {};
             targetFile = dataPart.data.targetFile || payload.targetFile;
             relatedFiles = dataPart.data.relatedFiles || payload.relatedFiles;
             
             // If payload exists, use it as the Source of Truth for "userInput" context
             if (Object.keys(payload).length > 0) {
                 finalUserInput = JSON.stringify(payload, null, 2);
             }
        }

        const basePrompt = await SystemPromptFactory.generate('CodeEditAgent', 'CodeEditAgent', assignedComplexity, finalUserInput, { targetFile, relatedFiles });

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
        // Parse Result to detect A2A envelope
        let parts: any[] = [];
        try {
            // Clean markdown
            const jsonMatch = result.match(/```json\n([\s\S]*?)\n```/) || result.match(/```\n([\s\S]*?)\n```/) || result.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : result;
            
            const parsed = JSON.parse(jsonString);
            if (parsed && typeof parsed === 'object') {
                 // Forward as A2A Data
                 parts.push({
                    kind: 'data',
                    mimeType: 'application/vnd.a2a+json',
                    data: parsed
                 });
            } else {
                 parts.push({ kind: 'text', text: result });
            }
        } catch (e) {
            // Fallback to plain text
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
