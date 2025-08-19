import { AgentExecutor, RequestContext, ExecutionEventBus } from "../a2a_server";
import { TaskStatusUpdateEvent, Message } from "../core_data_structures";
import { LlmService } from "../llm_service";
import { v4 as uuid } from 'uuid';

interface AgentConfig {
    model: string;
    apiKeys: string[];
}

/**
 * Implements the agent logic for generating documentation.
 */
export class DocGenExecutor implements AgentExecutor {
    private cancelledTasks = new Set<string>();
    private llmService: LlmService;
    private model: string;

    constructor(config: AgentConfig) {
        this.llmService = new LlmService(config.apiKeys);
        this.model = config.model;
    }

    public async cancelTask(taskId: string): Promise<void> {
        console.log(`[DocGenExecutor] Cancelling task: ${taskId}`);
        this.cancelledTasks.add(taskId);
    }

    public async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
        const { taskId, contextId, userMessage } = requestContext;

        try {
            eventBus.publish(this.createStatusUpdate(taskId, contextId, 'working', 'Thinking...'));

            const code = userMessage.parts.find(p => p.kind === 'text')?.text;
            if (!code) {
                throw new Error("No code provided in the message.");
            }

            if (this.cancelledTasks.has(taskId)) {
                eventBus.publish(this.createStatusUpdate(taskId, contextId, 'canceled', 'Task was cancelled.', true));
                return;
            }

            const prompt = `Generate a concise JSDoc comment for the following TypeScript code. Only return the comment, without any extra text or code fences.\n\nCode:\n\`\`\`typescript\n${code}\n\`\`\``;

            // Use the model specified in the constructor
            const documentation = await this.llmService.getCompletion(prompt, this.model);

            const responseMessage: Message = {
                kind: 'message',
                messageId: uuid(),
                role: 'agent',
                parts: [{ kind: 'text', text: documentation }],
                taskId: taskId,
                contextId: contextId,
            };

            eventBus.publish(this.createStatusUpdate(taskId, contextId, 'completed', 'Done', true, responseMessage));

        } catch (error: unknown) {
            const errorMessage = (error instanceof Error) ? error.message : 'An unknown error occurred.';
            console.error(`[DocGenExecutor] Error executing task ${taskId}:`, error);
            eventBus.publish(this.createStatusUpdate(taskId, contextId, 'error', errorMessage, true));
        } finally {
            eventBus.finished();
            this.cancelledTasks.delete(taskId);
        }
    }

    private createStatusUpdate(taskId: string, contextId: string, state: 'working' | 'completed' | 'canceled' | 'error', text: string, final: boolean = false, message?: Message): TaskStatusUpdateEvent {
        // This function remains the same
        return { kind: 'status-update', taskId, contextId, status: { state, timestamp: new Date().toISOString(), message: message ?? { kind: 'message', messageId: uuid(), role: 'agent', parts: [{ kind: 'text', text }], taskId, contextId } }, final };
    }
}
