import { AgentExecutor, AgentCard, Task, TaskStatus, GetRequest, SendMessageRequest, TaskArtifact, StreamEvent } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';
import { getMcpClient } from "../mcp_client_provider";
import { McpClient } from "@modelcontextprotocol/sdk";
import { ConfigService } from "../config_service";

const taskStore = new Map<string, Task>();

export class CodeExecutionAgent implements AgentExecutor {
    private mcpClient: McpClient;
    private configService: ConfigService;

    constructor(private card: AgentCard) {
        this.mcpClient = getMcpClient();
        this.configService = ConfigService.getInstance();
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

        // Do not await, let it run in the background
        this.processExecution(task, (event) => {
            // In a real scenario, you'd stream these events back to the client.
            console.log('StreamEvent:', event);
        });

        return task;
    }

    private async processExecution(task: Task, stream: (event: StreamEvent) => void): Promise<void> {
        try {
            task.status = TaskStatus.RUNNING;
            taskStore.set(task.id, task);
            stream({ type: 'status-changed', status: TaskStatus.RUNNING });

            const command = task.request.message.content as string;
            if (!command || typeof command !== 'string') {
                throw new Error('No command provided in the message content.');
            }

            stream({ type: 'log', message: `Executing command: ${command}` });

            const mcpResponse = await this.mcpClient.tool.call({
                toolName: 'TerminalExecutionTool',
                input: { command },
            });

            const output = mcpResponse.output.text || `(No output from command)`;

            const artifact: TaskArtifact = {
                id: uuidv4(),
                taskId: task.id,
                type: 'tool_output',
                data: output,
                description: `Output of command: ${command}`
            };
            task.artifacts.push(artifact);
            stream({ type: 'artifact-created', artifact });

            task.status = TaskStatus.COMPLETED;
            task.output = output;
            taskStore.set(task.id, task);
            stream({ type: 'status-changed', status: TaskStatus.COMPLETED });

        } catch (e: any) {
            const errorMessage = e.message || 'An unknown error occurred.';
            task.status = TaskStatus.FAILED;
            task.output = errorMessage;
            if (task.steps.length > 0) {
                task.steps[task.steps.length - 1].output = { error: errorMessage };
            }
            taskStore.set(task.id, task);
            stream({ type: 'status-changed', status: TaskStatus.FAILED });
            stream({ type: 'log', message: `Task failed: ${errorMessage}` });
        }
    }
}
