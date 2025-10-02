import * as vscode from 'vscode';
import { AgentExecutor, AgentCard, Task, TaskStatus, GetRequest, SendMessageRequest, TaskArtifact, StreamEvent } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';
import { LLMService } from '../services/LLMService';
import { ConfigService } from '../config_service';
import { getMcpClient } from "../mcp_client_provider";
import { McpClient } from "@modelcontextprotocol/sdk";

const taskStore = new Map<string, Task>();

export class CommentGenerationAgent implements AgentExecutor {
    private llmService: LLMService;
    private configService: ConfigService;
    private mcpClient: McpClient;

    constructor(private card: AgentCard) {
        this.llmService = LLMService.getInstance();
        this.configService = ConfigService.getInstance();
        this.mcpClient = getMcpClient();
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
        this.processGeneration(task, (event) => { console.log('StreamEvent:', event); });
        return task;
    }

    private async processGeneration(task: Task, stream: (event: StreamEvent) => void): Promise<void> {
        try {
            task.status = TaskStatus.RUNNING;
            taskStore.set(task.id, task);
            stream({ type: 'status-changed', status: TaskStatus.RUNNING });

            const { filePath } = task.request.message.content as { filePath: string };
            if (!filePath) {
                throw new Error('No filePath provided.');
            }
            stream({ type: 'log', message: `Reading file for comment generation: ${filePath}` });

            const fileContentResponse = await this.mcpClient.tool.call({ toolName: 'FileReadTool', input: { filePath } });
            const fileContent = fileContentResponse.output.text;

            const systemPrompt = `You are an expert programmer tasked with writing high-quality code comments.\n\n**INSTRUCTIONS:**\n1. Analyze the provided code.\n2. Add concise, helpful JSDoc-style comments to all functions, classes, and complex logic blocks.\n3. **IMPORTANT**: You MUST return the complete, fully-modified code for the entire file. Do NOT use markdown or any other formatting. Output only the raw code.`;
            const userPrompt = `Add comments to the following code:\n\n${fileContent}`;

            stream({ type: 'log', message: 'Generating comments with LLM...' });
            const model = this.configService.getModel('CommentGenerationAgent');
            const apiKey = this.configService.getApiKeys()[0] || '';
            const endpoint = this.configService.getEndpoint();

            const llmResponse = await this.llmService.requestLLMCompletion(
                [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                apiKey, endpoint, [], model
            );
            const commentedCode = llmResponse.choices[0]?.message?.content;

            if (!commentedCode) {
                throw new Error('LLM failed to generate comments.');
            }

            const artifact: TaskArtifact = {
                id: uuidv4(),
                taskId: task.id,
                type: 'ui-action',
                data: {
                    label: 'Overwrite original file with comments',
                    toolName: 'FileWriteTool',
                    arguments: { filePath, content: commentedCode },
                    suggestionId: uuidv4(),
                    suggestionType: 'commenting'
                },
                description: `Suggested comments for ${filePath}`
            };
            task.artifacts.push(artifact);
            stream({ type: 'artifact-created', artifact });

            task.status = TaskStatus.COMPLETED;
            task.output = `Comment generation complete for ${filePath}.`;
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