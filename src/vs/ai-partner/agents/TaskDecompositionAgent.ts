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

    protected async getSystemPrompt(userInput: string, requestContext: RequestContext, seniorIntuition?: string): Promise<string> {
        // 1. Extract Complexity from Dual-Channel Fallback (Text)
        // Format: [SYSTEM INSTRUCTION: This task is assigned Complexity Level 5. Execute accordingly.]
        const complexityMatch = userInput.match(/Complexity Level (\d+)/);
        const assignedComplexity = complexityMatch ? parseInt(complexityMatch[1], 10) : 5; // Default to 5 (PM Standard)

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
        return SystemPromptFactory.getInstance().generate('pm', 'TaskDecompositionAgent', assignedComplexity, finalUserInput, undefined, seniorIntuition);
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

    protected async handleCustomTool(name: string, args: any): Promise<any | undefined> {
        if (name === 'submit_tasks') {
            const tasks = args.tasks || [];
            // We can resolve by returning success, and handling the logic in handleExecutionResult
            // Or we handle here and throw an error or return success. Let runAgenticLoop return this.
            return JSON.stringify({ success: true, message: "Tasks submitted successfully." });
        }
        return undefined;
    }

    protected async handleExecutionResult(result: string, requestContext: RequestContext, eventBus: ExecutionEventBus, correlationId?: string): Promise<void> {
        // Since we use strict Tool Calling (submit_tasks), the result can just be text.
        // The actual parsing of tasks is best intercepted in onLoopComplete, or if the loop returns 
        // the JSON as result text.
        
        let tasks: string[] = [];
        
        try {
            const parsed = JSON.parse(result);
            if (Array.isArray(parsed)) {
                tasks = parsed;
            } else if (parsed && Array.isArray(parsed.tasks)) {
                tasks = parsed.tasks;
            }
        } catch (e) {
            // Not a JSON result directly
        }

        if (tasks.length > 0) {
            await this.handleTaskSubmission(tasks, requestContext, eventBus, correlationId);
            return;
        }

        // Just output the textual response or clarification
        eventBus.publish({ 
            kind: 'message', 
            messageId: uuidv4(), 
            role: 'agent', 
            parts: [{ kind: 'text', text: result }], 
            contextId: (requestContext as any).contextId 
        } as any);
    }

    protected async onLoopComplete(messages: any[]): Promise<void> {
        // Fallback: If handleExecutionResult wasn't passed the JSON args from the tool call directly,
        // we can extract the tasks from the message history tool calls.
        // Wait, TaskDecompositionAgent publishes task proposal and TASK.md. We should get it here or in handleExecutionResult.
        // Let's rely on handleExecutionResult seeing the JSON if `submit_tasks` was the final call,
        // or we can extract it here and trigger handleTaskSubmission.
        // Actually, runAgenticLoop usually returns the final string context. 
        // Let's extract tasks from the tool call in the history to be 100% sure.
        let foundTasks: string[] | null = null;
        for (const msg of messages) {
            if (msg.role === 'assistant' && msg.tool_calls) {
                for (const tc of msg.tool_calls) {
                    if (tc.function.name === 'submit_tasks') {
                         try {
                             const args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
                             if (args?.tasks) {
                                 foundTasks = args.tasks;
                             }
                         } catch (e) {}
                    }
                }
            }
        }
        
        // Expose them to the instance so handleExecutionResult can use them if needed, 
        // but handleExecutionResult doesn't have access to foundTasks easily unless we store it.
        // Let's store it on the instance:
        (this as any)._extractedTasks = foundTasks;
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