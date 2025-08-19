import { AgentExecutor, RequestContext, ExecutionEventBus } from "../a2a_server";
import { TaskStatusUpdateEvent, Message } from "../core_data_structures";
import { v4 as uuid } from 'uuid';

/**
 * Implements the agent logic for managing contextual information.
 */
export class ContextManagementExecutor implements AgentExecutor {
    private cancelledTasks = new Set<string>();

    public async cancelTask(taskId: string): Promise<void> {
        this.cancelledTasks.add(taskId);
    }

    public async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
        const { taskId, contextId, userMessage } = requestContext;

        try {
            eventBus.publish(this.createStatusUpdate(taskId, contextId, 'working', 'Gathering context information...'));

            if (this.cancelledTasks.has(taskId)) {
                eventBus.publish(this.createStatusUpdate(taskId, contextId, 'canceled', 'Task was cancelled.', true));
                eventBus.finished();
                return;
            }

            // Simulate gathering context (e.g., active file, selection, etc.)
            const contextInfo = `Context for message '${userMessage.messageId}': Active editor, selected text, and project files are being managed.`;

            const responseMessage: Message = {
                kind: 'message',
                messageId: uuid(),
                role: 'agent',
                parts: [{ kind: 'text', text: contextInfo }],
                taskId,
                contextId,
            };

            eventBus.publish(this.createStatusUpdate(taskId, contextId, 'completed', 'Done', true, responseMessage));

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`[ContextManagementExecutor] Error executing task ${taskId}:`, error);
            eventBus.publish(this.createStatusUpdate(taskId, contextId, 'error', msg, true));
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
