import * as vscode from 'vscode';
import { AgentExecutor, AgentCard, Task, TaskStatus, GetRequest, SendMessageRequest, TaskArtifact, StreamEvent } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';
import { LLMService } from '../services/LLMService';
import { ConfigService } from '../config_service';

const taskStore = new Map<string, Task>();

export class TestGenerationAgent implements AgentExecutor {
    private llmService: LLMService;
    private configService: ConfigService;

    constructor(private card: AgentCard) {
        this.llmService = LLMService.getInstance();
        this.configService = ConfigService.getInstance();
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

            const { filePath, query } = task.request.message.content as { filePath: string, query: string };
            if (!filePath) {
                throw new Error('No filePath provided.');
            }
            stream({ type: 'log', message: `Generating tests for: ${filePath}` });

            const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            const code = new TextDecoder().decode(fileContent);

            const prompt = `You are an expert test engineer. Your task is to write unit tests for the following code, based on the user\'s request.\n\nFile Path: ${filePath}\nUser Request: \"${query}\"\n\nCode:\n\
\`\`\`\n${code}\n\`\`\`\n\nPlease generate a comprehensive suite of unit tests using a popular testing framework appropriate for the language.\nRespond with only the generated test code inside a markdown code block. Add comments where necessary.`;

            const model = this.configService.getModel('TestGenerationAgent');
            const apiKey = this.configService.getApiKeys()[0] || '';
            const endpoint = this.configService.getEndpoint();

            const llmResponse = await this.llmService.requestLLMCompletion(
                [{ role: 'user', content: prompt }],
                apiKey, endpoint, [], model
            );

            const generatedTests = llmResponse.choices[0]?.message?.content || '// No tests were generated.';

            const artifact: TaskArtifact = {
                id: uuidv4(),
                taskId: task.id,
                type: 'test_file_content',
                data: generatedTests,
                description: `Generated unit tests for ${filePath}`
            };
            task.artifacts.push(artifact);
            stream({ type: 'artifact-created', artifact });

            task.status = TaskStatus.COMPLETED;
            task.output = 'Test generation complete.';
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
