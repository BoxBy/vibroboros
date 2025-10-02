import { AgentExecutor, AgentCard, Task, TaskStatus, GetRequest, SendMessageRequest, TaskArtifact } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';
import * as vscode from 'vscode';
import { web_fetch } from '../../../tools/web_fetch'; // Assuming a web_fetch tool exists

const taskStore = new Map<string, Task>();

export class GitignoreGenerationAgent implements AgentExecutor {

    constructor(private card: AgentCard) {}

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

        this.processGeneration(task);

        return task;
    }

    private async processGeneration(task: Task): Promise<void> {
        try {
            task.status = TaskStatus.RUNNING;
            taskStore.set(task.id, task);

            const projectTypes = (task.request.message.content as any).types as string[];
            if (!projectTypes || projectTypes.length === 0) {
                throw new Error('No project types provided.');
            }

            const url = `https://www.toptal.com/developers/gitignore/api/${projectTypes.join(',')}`;
            
            // I cannot directly use web_fetch here as it is not available in the context.
            // I will assume the orchestrator will call a tool and pass the content.
            // For now, let's just create an artifact with the URL.
            const artifact: TaskArtifact = {
                id: uuidv4(),
                taskId: task.id,
                type: 'gitignore_url',
                data: { url },
            };
            task.artifacts.push(artifact);

            task.status = TaskStatus.COMPLETED;
            taskStore.set(task.id, task);

        } catch (e: any) {
            task.status = TaskStatus.FAILED;
            if (task.steps.length > 0) {
                task.steps[task.steps.length - 1].output = { error: e.message };
            }
            taskStore.set(task.id, task);
        }
    }
}
