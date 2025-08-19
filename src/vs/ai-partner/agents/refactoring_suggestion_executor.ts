import { AgentExecutor, RequestContext, ExecutionEventBus } from "../a2a_server";
import { TaskStatusUpdateEvent, Message, TaskArtifact } from "../core_data_structures";
import { LlmService } from "../llm_service";
import { v4 as uuidv4 } from 'uuid';

interface AgentConfig {
    model: string;
    apiKeys: string[];
}

/**
 * Implements the agent logic for generating refactoring suggestions.
 */
export class RefactoringSuggestionExecutor implements AgentExecutor {
    private cancelledTasks = new Set<string>();
    private llmService: LlmService;
    private model: string;

    constructor(config: AgentConfig) {
        this.llmService = new LlmService(config.apiKeys);
        this.model = config.model;
    }

    public async cancelTask(taskId: string): Promise<void> {
        this.cancelledTasks.add(taskId);
    }

    public async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
        const { taskId, contextId, userMessage } = requestContext;

        try {
            eventBus.publish(this.createStatusUpdate(taskId, contextId, 'working', 'Analyzing code for refactoring opportunities...'));

            const code = userMessage.parts.find(p => p.kind === 'text')?.text;
            if (!code) {
                throw new Error("No code provided in the message.");
            }

            if (this.cancelledTasks.has(taskId)) {
                eventBus.publish(this.createStatusUpdate(taskId, contextId, 'canceled', 'Task was cancelled.', true));
                return;
            }

            const prompt = `Analyze the following TypeScript code and provide suggestions for refactoring. Focus on improving readability, performance, and adherence to best practices. Return the suggestions as a list in a Markdown format.\n\nCode:\n\`\`\`typescript\n${code}\n\`\`\``;

            const suggestions = await this.llmService.getCompletion(prompt, this.model);

            const artifact: TaskArtifact = {
                artifactId: uuidv4(),
                name: 'refactoring-suggestions',
                parts: [{ kind: 'text', text: suggestions }]
            };

            eventBus.publish({ kind: 'artifact-update', taskId, contextId, artifact, append: false, lastChunk: true });
            eventBus.publish(this.createStatusUpdate(taskId, contextId, 'completed', 'Done', true));

        } catch (error: any) {
            console.error(`[RefactoringSuggestionExecutor] Error executing task ${taskId}:`, error);
            eventBus.publish(this.createStatusUpdate(taskId, contextId, 'error', error.message, true));
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
                message: message ?? { kind: 'message', messageId: uuidv4(), role: 'agent', parts: [{ kind: 'text', text }], taskId, contextId },
            },
            final,
        };
    }
}
