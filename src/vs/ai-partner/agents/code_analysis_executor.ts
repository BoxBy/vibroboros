import { AgentExecutor, RequestContext, ExecutionEventBus } from "../a2a_server";
import { TaskStatusUpdateEvent, Message } from "../core_data_structures";
import { LlmService } from "../llm_service";
import { v4 as uuid } from 'uuid';

/**
 * Implements the agent logic for analyzing and summarizing code.
 */
export class CodeAnalysisExecutor implements AgentExecutor {
    private cancelledTasks = new Set<string>();

    public async cancelTask(taskId: string): Promise<void> {
        this.cancelledTasks.add(taskId);
    }

    public async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
        const { taskId, contextId, userMessage } = requestContext;

        try {
            eventBus.publish(this.createStatusUpdate(taskId, contextId, 'working', 'Analyzing code...'));

            const code = userMessage.parts.find(p => p.kind === 'text')?.text;
            if (!code) {
                throw new Error("No code provided in the message.");
            }

            if (this.cancelledTasks.has(taskId)) {
                eventBus.publish(this.createStatusUpdate(taskId, contextId, 'canceled', 'Task was cancelled.', true));
                eventBus.finished();
                return;
            }

            const prompt = `Analyze the following TypeScript code and provide a brief, one-paragraph summary of its purpose, inputs, and outputs. Format the response as plain text.\n\nCode:\n\`\`\`typescript\n${code}\n\`\`\``;
            const llmService = LlmService.getInstance();
            const summary = await llmService.getCompletion(prompt);

            const responseMessage: Message = {
                kind: 'message',
                messageId: uuid(),
                role: 'agent',
                parts: [{ kind: 'text', text: summary }],
                taskId,
                contextId,
            };

            eventBus.publish(this.createStatusUpdate(taskId, contextId, 'completed', 'Done', true, responseMessage));

        } catch (error: unknown) {
            const errorMessage = (error instanceof Error) ? error.message : 'An unknown error occurred.';
            console.error(`[CodeAnalysisExecutor] Error executing task ${taskId}:`, error);
            eventBus.publish(this.createStatusUpdate(taskId, contextId, 'error', errorMessage, true));
        } finally {
            eventBus.finished();
            this.cancelledTasks.delete(taskId);
        }
    }

    private createStatusUpdate(taskId: string, contextId: string, state: 'working' | 'completed' | 'canceled' | 'error', text: string, final: boolean = false, message?: Message): TaskStatusUpdateEvent {
        return {
            kind: 'status-update',
            taskId,
            contextId,
            status: {
                state,
                timestamp: new Date().toISOString(),
                message: message ?? {
                    kind: 'message',
                    messageId: uuid(),
                    role: 'agent',
                    parts: [{ kind: 'text', text }],
                    taskId,
                    contextId,
                },
            },
            final,
        };
    }
}
