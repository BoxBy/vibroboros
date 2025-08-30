import { AgentExecutor, RequestContext, ExecutionEventBus } from "../a2a_server";
import { TaskStatusUpdateEvent } from "../core_data_structures";
import { LLMService, LlmMessage } from "../services/LLMService";
import { ConfigService } from "../config_service";
import { v4 as uuidv4 } from 'uuid';

/**
 * Implements the agent logic for generating refactoring suggestions.
 */
export class RefactoringSuggestionExecutor implements AgentExecutor {
    private cancelledTasks = new Set<string>();
    private llmService: LLMService;
    private configService: ConfigService;

    constructor() {
        this.llmService = new LLMService();
        this.configService = ConfigService.getInstance();
    }

    public async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
        this.cancelledTasks.add(taskId);
        // Optionally publish a cancellation event
        eventBus.publish(this.createStatusUpdate(taskId, "", 'canceled', 'Task was cancelled by user.', true));
        eventBus.finished();
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
                // The cancelTask method will have already published the status
                return;
            }

            const prompt = `Analyze the following TypeScript code and provide suggestions for refactoring. Focus on improving readability, performance, and adherence to best practices. Return the suggestions as a list in a Markdown format.\n\nCode:\n\`\`\`typescript\n${code}\n\`\`\``;
            const conversationHistory: LlmMessage[] = [{ role: 'user', content: prompt }];
            const apiKeys = this.configService.getApiKeys();
            const endpoint = this.configService.getEndpoint();
            const model = this.configService.getModel('refactoring');

            const suggestions = await this.llmService.requestLLMCompletion(conversationHistory, apiKeys[0], endpoint, [], model);

            eventBus.publish({
                kind: 'artifact-update',
                taskId,
                contextId,
                artifact: {
                    artifactId: uuidv4(),
                    name: 'refactoring-suggestions',
                    parts: [{ kind: 'text', text: suggestions.content }]
                },
                append: false,
                lastChunk: true
            });

            eventBus.publish(this.createStatusUpdate(taskId, contextId, 'completed', 'Done', true));

        } catch (error: any) {
            console.error(`[RefactoringSuggestionExecutor] Error executing task ${taskId}:`, error);
            eventBus.publish(this.createStatusUpdate(taskId, contextId, 'error', error.message, true));
        } finally {
            eventBus.finished();
            this.cancelledTasks.delete(taskId);
        }
    }

    private createStatusUpdate(taskId: string, contextId: string, state: 'working' | 'completed' | 'canceled' | 'error', text: string, final: boolean = false): TaskStatusUpdateEvent {
        return {
            kind: 'status-update',
            taskId,
            contextId,
            status: {
                state,
                timestamp: new Date().toISOString(),
                message: {
                    kind: 'message',
                    messageId: uuidv4(),
                    role: 'agent',
                    parts: [{ kind: 'text', text }],
                    taskId,
                    contextId
                },
            },
            final,
        };
    }
}
