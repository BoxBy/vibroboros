import * as vscode from 'vscode';
import { LLMService, LlmMessage } from '../services/LLMService';
import { ConfigService } from '../config_service';
import { AgentExecutor, ExecutionEventBus, RequestContext } from '../a2a_server';
import { v4 as uuidv4 } from 'uuid';
import { TaskStatusUpdateEvent } from '../core_data_structures';

/**
 * Executes the core logic for the Code Analysis Agent.
 */
export class CodeAnalysisExecutor implements AgentExecutor {
    private llmService: LLMService;
    private configService: ConfigService;

    constructor() {
        this.llmService = new LLMService();
        this.configService = ConfigService.getInstance();
    }

    public async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
        const userQuery = requestContext.userMessage.parts.find(p => p.kind === 'text')?.text ?? '';
        const suggestions = await this.provideSuggestions(userQuery, {});

        eventBus.publish(this.createStatusUpdate(requestContext.taskId, requestContext.contextId, 'working', 'Generating suggestions...'));

        eventBus.publish({
            kind: 'artifact-update',
            taskId: requestContext.taskId,
            contextId: requestContext.contextId,
            artifact: {
                artifactId: uuidv4(),
                name: 'suggestions',
                parts: [{ kind: 'text', text: JSON.stringify(suggestions) }]
            },
            append: false,
            lastChunk: true
        });

        eventBus.publish(this.createStatusUpdate(requestContext.taskId, requestContext.contextId, 'completed', 'Done', true));
        eventBus.finished();
    }

    public async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
        console.log(`[CodeAnalysisExecutor] Cancellation requested for task ${taskId}`);
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
     * Analyzes the entire codebase to build a symbol index.
     * This is a simplified placeholder for a more robust indexing strategy.
     */
    public async analyzeProject(projectRoot: vscode.Uri): Promise<any> {
        console.log(`[CodeAnalysisExecutor] Starting project analysis at: ${projectRoot.fsPath}`);
        const symbols = {
            "file_count": 10, // Placeholder
            "symbols_found": 120 // Placeholder
        };
        console.log('[CodeAnalysisExecutor] Project analysis complete.');
        return { status: 'completed', symbols };
    }

    /**
     * Provides context-aware suggestions based on a user query and codebase analysis.
     */
    public async provideSuggestions(query: string, context: any): Promise<any> {
        const model = this.configService.getModel('CodeAnalysisAgent');
        const apiKeys = this.configService.getApiKeys();
        const endpoint = this.configService.getEndpoint();

        const systemPrompt = `You are a code analysis expert. Based on the following context, provide suggestions for the user\'s query.\nContext: ${JSON.stringify(context)}`;
        const userPrompt = `Query: ${query}`;

        const conversationHistory: LlmMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        try {
            const llmResponse = await this.llmService.requestLLMCompletion(conversationHistory, apiKeys[0], endpoint, [], model);
            return { suggestions: llmResponse.content };
        } catch (error: any) {
            console.error('[CodeAnalysisExecutor] Failed to get suggestions:', error);
            return { error: error.message };
        }
    }
}
