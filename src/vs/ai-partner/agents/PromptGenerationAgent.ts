import { CompositionRoot, ServiceIdentifiers } from '../di/CompositionRoot';
import { ISystemPromptFactory } from '../di/interfaces/ISystemPromptFactory';
import * as vscode from 'vscode';
import { AgentCard, Message } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from 'uuid';
import { getCoreLLMTools } from '../services/LLMTools';
import { BaseAgent } from './core/BaseAgent';

export class PromptGenerationAgent extends BaseAgent {
    constructor(card: AgentCard) {
        super(card);
    }

    protected async getSystemPrompt(userInput: string, requestContext: RequestContext, seniorIntuition?: string): Promise<string> {
        const promptFactory = CompositionRoot.resolve<ISystemPromptFactory>(ServiceIdentifiers.SystemPromptFactory);
        return promptFactory.generateWithOptions({
            role: 'PromptGenerationAgent',
            agentName: 'PromptGenerationAgent',
            userInput,
            seniorIntuition
        });
    }

    protected async getTools(userInput: string, requestContext: RequestContext): Promise<any[]> {
        return []; // This agent only thinks and outputs JSON, no tools needed
    }

    protected async handleExecutionResult(result: string, requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
        let parsedResult: any = result;
        try {
            const jsonMatch = result.match(/```json\n([\s\S]*?)\n```/) || result.match(/```\n([\s\S]*?)\n```/) || result.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : result;
            parsedResult = JSON.parse(jsonString);
        } catch (e) {
            this.log(`Failed to parse PromptGenerationAgent output as JSON. Output: ${result}`);
            parsedResult = { error: "Failed to parse generated prompt constraints." };
        }

        const msg: Message = {
            kind: 'message',
            messageId: uuidv4(),
            role: 'agent',
            parts: [{
                kind: 'data',
                mimeType: 'application/vnd.a2a+json',
                data: parsedResult
            }],
            contextId: (requestContext as any)?.contextId
        } as any;
        eventBus.publish(msg as any);
    }

    public async cancelTask(): Promise<void> {
        return Promise.resolve();
    }
}
