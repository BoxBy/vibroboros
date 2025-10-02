import { AgentExecutor, AgentCard, Task, TaskStatus, GetRequest, SendMessageRequest, TaskArtifact, StreamEvent } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';
import { getMcpClient } from "../mcp_client_provider";
import { McpClient } from "@modelcontextprotocol/sdk";

const taskStore = new Map<string, Task>();

export class SecurityAnalysisAgent implements AgentExecutor {
    private mcpClient: McpClient;

    constructor(private card: AgentCard) {
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
        this.processAnalysis(task, (event) => { console.log('StreamEvent:', event); });
        return task;
    }

    private async processAnalysis(task: Task, stream: (event: StreamEvent) => void): Promise<void> {
        try {
            task.status = TaskStatus.RUNNING;
            taskStore.set(task.id, task);
            stream({ type: 'status-changed', status: TaskStatus.RUNNING });

            const { filePath } = task.request.message.content as { filePath: string };
            if (!filePath) {
                throw new Error('No filePath provided.');
            }
            stream({ type: 'log', message: `Performing security analysis on: ${filePath}` });

            const analysisResult = await this.mcpClient.tool.call({ 
                toolName: 'SecurityVulnerabilityTool', 
                input: { filePath } 
            });

            const vulnerabilities = analysisResult.output.vulnerabilities; // Assuming this is the output structure

            if (vulnerabilities && vulnerabilities.length > 0) {
                const artifact: TaskArtifact = {
                    id: uuidv4(),
                    taskId: task.id,
                    type: 'vulnerability_report',
                    data: vulnerabilities,
                    description: `Security vulnerabilities found in ${filePath}`
                };
                task.artifacts.push(artifact);
                stream({ type: 'artifact-created', artifact });
                task.output = `Found ${vulnerabilities.length} potential vulnerabilities.`;
            } else {
                task.output = 'No security vulnerabilities found.';
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