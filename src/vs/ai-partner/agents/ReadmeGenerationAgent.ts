import * as vscode from 'vscode';
import { AgentExecutor, AgentCard, Task, TaskStatus, GetRequest, SendMessageRequest, TaskArtifact, StreamEvent } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';
import { LLMService } from '../services/LLMService';
import { ConfigService } from '../config_service';
import { getMcpClient } from "../mcp_client_provider";
import { McpClient } from "@modelcontextprotocol/sdk";

const taskStore = new Map<string, Task>();

export class ReadmeGenerationAgent implements AgentExecutor {
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
        if (!task) {
            throw new Error('Task not found');
        }
        return Promise.resolve(task);
    }

    async sendMessage(req: SendMessageRequest): Promise<Task> {
        const taskId = uuidv4();
        const task: Task = {
            id: taskId,
            status: TaskStatus.PENDING,
            request: req,
            steps: [],
            artifacts: [],
        };
        taskStore.set(taskId, task);

        this.processGeneration(task, (event) => { console.log('StreamEvent:', event); });

        return task;
    }

    private async processGeneration(task: Task, stream: (event: StreamEvent) => void): Promise<void> {
        try {
            task.status = TaskStatus.RUNNING;
            taskStore.set(task.id, task);
            stream({ type: 'status-changed', status: TaskStatus.RUNNING });
            stream({ type: 'log', message: 'Auto-updating README.md... Gathering project context.' });

            const planContent = await this._readFileWithTool('PLAN.md', stream);
            const progressContent = await this._readFileWithTool('PROGRESS.md', stream);
            const taskContent = await this._readFileWithTool('TASK.md', stream);

            const systemPrompt = `You are a senior software engineer writing a professional README.md for a new open-source project. The audience is other developers. Create a README similar in structure and quality to a high-quality open source project. Adapt the content to the project's context. Include a title, introduction, badges, news/updates, getting started, deployment, contributing, and license sections. For the "Documentation" section, link to './docs/philosophy.md' and './docs/architecture.md'.`;

            const userPrompt = `Here is the project context:
--- PROJECT PLAN (PLAN.md) ---
${planContent}
--- CURRENT PROGRESS (PROGRESS.md) ---
${progressContent}
--- KEY TASKS (TASK.md) ---
${taskContent}
--- Based on this, generate a complete README.md file.`;

            stream({ type: 'log', message: 'Context gathered. Generating README with LLM...' });

            const model = this.configService.getModel('ReadmeGenerationAgent');
            const apiKey = this.configService.getApiKeys()[0] || '';
            const endpoint = this.configService.getEndpoint();

            const llmResponse = await this.llmService.requestLLMCompletion(
                [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                apiKey, endpoint, [], model
            );

            const generatedReadme = llmResponse.choices[0]?.message?.content;
            if (!generatedReadme) {
                throw new Error('LLM failed to generate a README.');
            }

            stream({ type: 'log', message: 'README content generated. Saving file... ' });
            const rootPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
            const readmePath = path.join(rootPath, 'README.md');

            await this._writeFileWithTool(readmePath, generatedReadme, stream);

            const artifact: TaskArtifact = {
                id: uuidv4(),
                taskId: task.id,
                type: 'readme_file',
                data: generatedReadme,
                description: 'Generated README.md content'
            };
            task.artifacts.push(artifact);
            stream({ type: 'artifact-created', artifact });

            task.status = TaskStatus.COMPLETED;
            task.output = 'README.md generated successfully.';
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

    private async _readFileWithTool(fileName: string, stream: (event: StreamEvent) => void): Promise<string> {
        const rootPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
        if (!rootPath) {
            return `Could not find workspace root to read ${fileName}`;
        }
        const filePath = path.join(rootPath, fileName);

        try {
            const response = await this.mcpClient.tool.call({
                toolName: 'FileReadTool',
                input: { filePath }
            });
            return response.output.text || `File not found or empty: ${fileName}`;
        } catch (e: any) {
            stream({ type: 'log', message: `Failed to read ${fileName} with FileReadTool: ${e.message}` });
            return `Error reading file: ${fileName}`;
        }
    }

    private async _writeFileWithTool(filePath: string, content: string, stream: (event: StreamEvent) => void): Promise<void> {
        try {
            await this.mcpClient.tool.call({
                toolName: 'FileWriteTool',
                input: { filePath, content }
            });
        } catch (e: any) {
            stream({ type: 'log', message: `Failed to write to ${filePath} with FileWriteTool: ${e.message}` });
            throw new Error(`Failed to write README.md to ${filePath}.`);
        }
    }
}
