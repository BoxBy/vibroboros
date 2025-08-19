import { AgentExecutor, RequestContext, ExecutionEventBus } from "../a2a_server";
import { TaskStatusUpdateEvent, Message } from "../core_data_structures";
import { v4 as uuid } from 'uuid';

/**
 * Implements the agent logic for AI-led learning from user interactions.
 */
export class AILedLearningExecutor implements AgentExecutor {
    private cancelledTasks = new Set<string>();

    public async cancelTask(taskId: string): Promise<void> {
        this.cancelledTasks.add(taskId);
    }

    public async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
        const { taskId, contextId, userMessage } = requestContext;

        try {
            eventBus.publish(this.createStatusUpdate(taskId, contextId, 'working', 'Learning from interaction...'));

            if (this.cancelledTasks.has(taskId)) {
                eventBus.publish(this.createStatusUpdate(taskId, contextId, 'canceled', 'Task was cancelled.', true));
                eventBus.finished();
                return;
            }

            const learningSummary = `Learned from message '${userMessage.messageId}'. In the future, I will suggest better workflows.`;

            const responseMessage: Message = {
                kind: 'message',
                messageId: uuid(),
                role: 'agent',
                parts: [{ kind: 'text', text: learningSummary }],
                taskId,
                contextId,
            };

            eventBus.publish(this.createStatusUpdate(taskId, contextId, 'completed', 'Done', true, responseMessage));

        } catch (error: unknown) {
            const errorMessage = (error instanceof Error) ? error.message : 'An unknown error occurred.';
            console.error(`[AILedLearningExecutor] Error executing task ${taskId}:`, error);
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
