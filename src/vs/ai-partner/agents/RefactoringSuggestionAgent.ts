import * as vscode from 'vscode';
import { AgentExecutor, AgentCard, Task, TaskStatus, GetRequest, SendMessageRequest, TaskArtifact, StreamEvent, A2AClient } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';
import { LLMService, LlmMessage } from '../services/LLMService';
import { ConfigService } from '../config_service';
import { getMcpClient } from "../mcp_client_provider";
import { McpClient } from "@modelcontextprotocol/sdk";

const taskStore = new Map<string, Task>();

export class RefactoringSuggestionAgent implements AgentExecutor {
    private llmService: LLMService;
    private configService: ConfigService;
    private mcpClient: McpClient;
    private learningAgentClient: A2AClient;

    constructor(agentBaseUrl: string, private card: AgentCard) {
        this.llmService = LLMService.getInstance();
        this.configService = ConfigService.getInstance();
        this.mcpClient = getMcpClient();
        this.learningAgentClient = new A2AClient({ baseUrl: `${agentBaseUrl}/agent/ai-led-learning` });
    }

    getAgentCard(): Promise<AgentCard> {
        return Promise.resolve(this.card);
    }

    getTask(req: GetRequest): Promise<Task> {
        const task = taskStore.get(req.taskId);
        if (!task) { throw new Error('Task not found'); }
        return Promise.resolve(task);
    }

    async sendMessage(req: SendMessageRequest): Promise<Task> {
        const taskId = uuidv4();
        const task: Task = { id: taskId, status: TaskStatus.PENDING, request: req, steps: [], artifacts: [] };
        taskStore.set(taskId, task);
        this.processSuggestion(task, (event) => { console.log('StreamEvent:', event); });
        return task;
    }

    private async processSuggestion(task: Task, stream: (event: StreamEvent) => void): Promise<void> {
        try {
            task.status = TaskStatus.RUNNING;
            taskStore.set(task.id, task);
            stream({ type: 'status-changed', status: TaskStatus.RUNNING });

            const { filePath, query } = task.request.message.content as { filePath: string, query: string };
            stream({ type: 'log', message: `Reading file: ${filePath}` });

            const fileContentResponse = await this.mcpClient.tool.call({ toolName: 'FileReadTool', input: { filePath } });
            const fileContent = fileContentResponse.output.text;

            stream({ type: 'log', message: `Getting user preferences...` });
            const preferenceTask = await this.learningAgentClient.sendMessage({ message: { content: { preferenceKey: 'refactoring' }, metadata: { type: 'get-preference' } } });
            const userPreference = preferenceTask.output; // Assuming the output is the preference value

            let personalizationInstruction = '';
            if (userPreference === 'negative') {
                personalizationInstruction = `The user frequently dismisses refactoring suggestions. Only propose a change if it offers a significant, unambiguous improvement.`;
            }

            const systemPrompt = `You are an expert software engineer specializing in code refactoring. Analyze the user's request and the provided code. Rewrite the entire code for the file, incorporating the requested improvements. Your response must contain ONLY the raw, refactored code. Do not include any explanations or markdown formatting.\n${personalizationInstruction}`;
            const userPrompt = `The user wants to refactor this file: ${filePath}.\\nTheir request is: \\\"${query}\\\"\\n\\nHere is the original code:\\n\`\`\`\\n${fileContent}\\n\`\`\``;

            stream({ type: 'log', message: 'Generating refactoring suggestion with LLM...' });
            const model = this.configService.getModel('RefactoringSuggestionAgent');
            const apiKey = this.configService.getApiKeys()[0] || '';
            const endpoint = this.configService.getEndpoint();

            const llmResponse = await this.llmService.requestLLMCompletion(
                [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                apiKey, endpoint, [], model
            );
            const refactoredCode = llmResponse.choices[0]?.message?.content;

            if (!refactoredCode || refactoredCode.trim() === fileContent.trim()) {
                task.output = `No significant refactoring was necessary for ${filePath}.`;
            } else {
                const artifact: TaskArtifact = {
                    id: uuidv4(),
                    taskId: task.id,
                    type: 'ui-action',
                    data: {
                        label: 'Apply Refactoring',
                        toolName: 'FileWriteTool',
                        arguments: { filePath, content: refactoredCode },
                        suggestionId: uuidv4(),
                        suggestionType: 'refactoring'
                    },
                    description: `Suggested refactoring for ${filePath}`
                };
                task.artifacts.push(artifact);
                stream({ type: 'artifact-created', artifact });
                task.output = `Refactoring suggestion created for ${filePath}.`;
            }

            task.status = TaskStatus.COMPLETED;
            taskStore.set(task.id, task);
            stream({ type: 'status-changed', status: TaskStatus.COMPLETED });

        } catch (e: any) {
            const errorMessage = e.message || 'An unknown error occurred.';
            task.status = TaskStatus.FAILED;
            task.output = errorMessage;
            taskStore.set(task.id, task);
            stream({ type: 'status-changed', status: TaskStatus.FAILED });
            stream({ type: 'log', message: `Task failed: ${errorMessage}` });
        }
    }
}
