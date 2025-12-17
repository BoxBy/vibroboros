import { SystemPromptFactory } from '../services/SystemPromptFactory';
import * as vscode from 'vscode';
import * as path from 'path';
import { AgentCard, Message } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from 'uuid';
import { getCoreLLMTools } from '../services/LLMTools';
import { BaseAgent } from './core/BaseAgent';
import { publishProgressLog } from './utils/sdkProgressHelper';
import { ConfigService } from '../config_service';


export class TaskDecompositionAgent extends BaseAgent {

    constructor(card: AgentCard) {
        super(card);
    }

    // --- Unified Flow Implementation ---

    protected async getSystemPrompt(userInput: string, requestContext: RequestContext): Promise<string> {
        // 1. Extract Complexity from Dual-Channel Fallback (Text)
        // Format: [SYSTEM INSTRUCTION: This task is assigned Complexity Level 5. Execute accordingly.]
        const complexityMatch = userInput.match(/Complexity Level (\d+)/);
        const assignedComplexity = complexityMatch ? parseInt(complexityMatch[1], 10) : 5; // Default to 5 (PM Standard)

        // 2. Generate Prompt via Factory
        return SystemPromptFactory.generate('pm', 'TaskDecompositionAgent', assignedComplexity, userInput);
    }


    protected async getTools(userInput: string, requestContext: RequestContext): Promise<any[]> {
        const { provider } = await this.getLLMConfig();
        
        const submitTasksTool = {
            type: 'function',
            function: {
                name: 'submit_tasks',
                description: 'Submit the decomposed list of tasks.',
                parameters: {
                    type: 'object',
                    properties: {
                        tasks: { 
                            type: 'array', 
                            items: { type: 'string' },
                            description: 'Array of task strings.'
                        }
                    },
                    required: ['tasks'],
                    additionalProperties: false
                }
            }
        };

        return [...getCoreLLMTools(provider), submitTasksTool];
    }

    public async cancelTask(): Promise<void> {
        // No-op
    }

    protected async handleExecutionResult(result: string, requestContext: RequestContext, eventBus: ExecutionEventBus, correlationId?: string): Promise<void> {
        let tasks: string[] = [];
        
        try {
            // Clean up Markdown backticks if present
            let cleanResult = result.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
            // Robustness: Extract JSON object if embedded in text
            const firstBrace = cleanResult.indexOf('{');
            const lastBrace = cleanResult.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                cleanResult = cleanResult.substring(firstBrace, lastBrace + 1);
            }

            const parsed = JSON.parse(cleanResult);
            if (Array.isArray(parsed)) {
                tasks = parsed;
            } else if (parsed && Array.isArray(parsed.tasks)) {
                tasks = parsed.tasks;
            }
            
            if (tasks.length === 0) {
                 // Check for clarification
                 if (parsed?.request_clarification) {
                     // Publish clarification
                     const { question, context, options } = parsed.request_clarification;
                     eventBus.publish({
                         kind: 'message',
                         messageId: uuidv4(),
                         role: 'agent',
                         parts: [{
                             kind: 'data',
                             mimeType: 'application/vnd.clarification-request+json',
                             data: { question, context, options }
                         }],
                         contextId: (requestContext as any)?.contextId
                     } as any);
                     return;
                 }
                 
                 // If just text response
                 if (typeof result === 'string' && result.length > 0) {
                      eventBus.publish({ kind: 'message', messageId: uuidv4(), role: 'agent', parts: [{ kind: 'text', text: result }], contextId: (requestContext as any).contextId } as any);
                      return;
                 }
            }

        } catch (e) {
            // Text fallback
             eventBus.publish({ kind: 'message', messageId: uuidv4(), role: 'agent', parts: [{ kind: 'text', text: result }], contextId: (requestContext as any).contextId } as any);
             return;
        }

        if (tasks.length > 0) {
            await this.handleTaskSubmission(tasks, requestContext, eventBus, correlationId);
        }
    }

    private async handleTaskSubmission(tasks: string[], requestContext: RequestContext, eventBus: ExecutionEventBus, correlationId?: string) {
        // Generate TASK.md content
        const taskContent = tasks.map((step, i) => {
            let cleanStep = step.replace(/^[\d\-*+•]\s*\.?\s*/, '').trim();
            cleanStep = cleanStep.replace(/^\d+\.\s*/, '').trim();
            return `${i + 1}. [ ] ${cleanStep}`;
        }).join('\n');
        const newTaskMarkdown = `# Implementation Tasks\n\n${taskContent}`;

        // Write TASK.md file
        const rootPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
        if (rootPath) {
            const taskPath = path.join(rootPath, 'TASK.md');
            try {
                await this.mcpClient.callTool({ name: 'FileWriteTool', arguments: { filePath: taskPath, content: newTaskMarkdown } } as any);
                publishProgressLog(eventBus, `[TaskDecompositionAgent] Created/updated TASK.md`, requestContext);
            } catch (e) {
                console.error('[TaskDecompositionAgent] Failed to write TASK.md:', e);
            }
        }

        // Send propose-task message
        const taskMsg: Message = {
            kind: 'message',
            messageId: uuidv4(),
            role: 'agent',
            parts: [{
                kind: 'data',
                mimeType: 'application/vnd.a2a+json',
                data: {
                    toolName: 'OrchestratorAgent',
                    command: 'propose-task',
                    payload: { tasks, filePath: 'TASK.md', correlation: correlationId }
                }
            } as any],
            contextId: (requestContext as any)?.contextId
        } as any;
        eventBus.publish(taskMsg);

        const finalMessage: Message = {
            kind: "message",
            messageId: uuidv4(),
            role: "agent",
            parts: [{ kind: "text", text: 'I have broken down the goal into tasks and created TASK.md.' }],
            contextId: (requestContext as any)?.contextId
        };
        eventBus.publish(finalMessage);
    }
}