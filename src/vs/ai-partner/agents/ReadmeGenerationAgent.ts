import { CompositionRoot, ServiceIdentifiers } from '../di/CompositionRoot';
import { ISystemPromptFactory } from '../di/interfaces/ISystemPromptFactory';
import * as vscode from 'vscode';
import * as path from 'path';
import { AgentCard, Message } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from 'uuid';
import { getCoreLLMTools } from '../services/LLMTools';
import { BaseAgent } from './core/BaseAgent';

export class ReadmeGenerationAgent extends BaseAgent {

    constructor(card: AgentCard) {
        super(card);
    }

    // --- Unified Flow Implementation ---

    protected async getSystemPrompt(userInput: string, requestContext: RequestContext, seniorIntuition?: string): Promise<string> {
        // 1. Extract Complexity
        const complexityMatch = userInput.match(/Complexity Level (\d+)/);
        const assignedComplexity = complexityMatch ? parseInt(complexityMatch[1], 10) : 30; // Default to Lv 1 (Simple) if undefined

        // 2. Generate Prompt via Factory

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
        return await promptFactory.generate('ReadmeGenerationAgent', 'ReadmeGenerationAgent', assignedComplexity, finalUserInput, undefined, seniorIntuition);
    }

    protected async getTools(userInput: string, requestContext: RequestContext): Promise<any[]> {
        const { provider } = await this.getLLMConfig();
        // Use standard tools (create_file, etc.)
        return getCoreLLMTools(provider);
    }

    protected async handleExecutionResult(result: string, requestContext: RequestContext, eventBus: ExecutionEventBus, correlationId?: string): Promise<void> {
        // A2A Standard Response
        // Actual work (Readme creation) is done via tool side-effects (create_file).
        
        const response: Message = {
            kind: 'message',
            messageId: uuidv4(),
            role: 'agent',
            parts: [{
                kind: 'data',
                mimeType: 'application/vnd.a2a+json',
                data: {
                    toolName: 'ReadmeGenerationAgent',
                    command: 'response-code-execution',
                    payload: {
                        success: true,
                        status: 'ok',
                        needsConfirmation: false, // File creation already approved via tool
                        message: "Readme generation task completed.",
                        result: result, // Include actual text output
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