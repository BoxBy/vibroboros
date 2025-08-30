import { LLMService, LlmMessage } from '../services/LLMService';
import { ConfigService } from '../config_service';
import { AgentExecutor, ExecutionEventBus, RequestContext } from '../a2a_server';
import { v4 as uuidv4 } from 'uuid';
import { TaskStatusUpdateEvent } from '../core_data_structures';

/**
 * Executes the core logic for the Documentation Generation Agent.
 */
export class DocGenExecutor implements AgentExecutor {
    private llmService: LLMService;
    private configService: ConfigService;

    constructor() {
        this.llmService = new LLMService();
        this.configService = ConfigService.getInstance();
    }

    public async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
        const codeToDocument = requestContext.userMessage.parts.find(p => p.kind === 'text')?.text ?? '';

        eventBus.publish(this.createStatusUpdate(requestContext.taskId, requestContext.contextId, 'working', 'Generating documentation...'));

        const result = await this.generateDocumentation(codeToDocument, '');

        eventBus.publish({
            kind: 'artifact-update',
            taskId: requestContext.taskId,
            contextId: requestContext.contextId,
            artifact: {
                artifactId: uuidv4(),
                name: 'documentation',
                parts: [{ kind: 'text', text: result.documentation }]
            },
            append: false,
            lastChunk: true
        });

        eventBus.publish(this.createStatusUpdate(requestContext.taskId, requestContext.contextId, 'completed', 'Done', true));
        eventBus.finished();
    }

    public async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
        console.log(`[DocGenExecutor] Cancellation requested for task ${taskId}`);
        eventBus.publish(this.createStatusUpdate(taskId, "", 'canceled', 'Task cancelled.', true));
        eventBus.finished();
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

    /**
     * Generates documentation for a given piece of code.
     * @param code The code snippet to generate documentation for.
     * @param query Additional user query or instructions.
     * @returns The generated documentation content.
     */
    public async generateDocumentation(code: string, query: string): Promise<any> {
        const model = this.configService.getModel('DocumentationGenerationAgent');
        const apiKeys = this.configService.getApiKeys();
        const endpoint = this.configService.getEndpoint();

        const systemPrompt = `You are a technical writer specializing in clear and concise code documentation. Based on the following code, generate documentation. ${query ? `Consider the user\'s request: ${query}` : ''}`;
        const userPrompt = `Code to document:\\n\\n\`\`\`\\n${code}\\n\`\`\``;

        const conversationHistory: LlmMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        try {
            const llmResponse = await this.llmService.requestLLMCompletion(conversationHistory, apiKeys[0], endpoint, [], model);
            return { documentation: llmResponse.content };
        } catch (error: any) {
            console.error('[DocGenExecutor] Failed to generate documentation:', error);
            return { error: error.message };
        }
    }
}
