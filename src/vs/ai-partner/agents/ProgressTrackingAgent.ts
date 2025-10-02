import * as vscode from 'vscode';
import { AgentExecutor, AgentCard, Task, TaskStatus, GetRequest, SendMessageRequest, TaskArtifact, StreamEvent } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';
import { getMcpClient } from "../mcp_client_provider";
import { McpClient } from "@modelcontextprotocol/sdk";
import * as path from 'path';

const taskStore = new Map<string, Task>();

interface PlanTask {
    id: string;
    description: string;
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
}

interface Plan {
    id: string;
    goal: string;
    tasks: PlanTask[];
}

export class ProgressTrackingAgent implements AgentExecutor {
    private static readonly PLAN_STATE_KEY = 'aiPartnerActivePlan';
    private mcpClient: McpClient;

    constructor(private state: vscode.Memento, private card: AgentCard) {
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
        this.processTask(task, (event) => { console.log('StreamEvent:', event); });
        return task;
    }

    private async processTask(task: Task, stream: (event: StreamEvent) => void): Promise<void> {
        try {
            task.status = TaskStatus.RUNNING;
            taskStore.set(task.id, task);
            stream({ type: 'status-changed', status: TaskStatus.RUNNING });

            const messageType = task.request.message.metadata?.type;
            const payload = task.request.message.content as any;
            let plan: Plan | undefined;

            switch (messageType) {
                case 'create-plan':
                    plan = {
                        id: uuidv4(),
                        goal: payload.goal,
                        tasks: payload.tasks.map((desc: string, index: number) => ({ id: `${index + 1}` , description: desc, status: 'PENDING' }))
                    };
                    await this.state.update(ProgressTrackingAgent.PLAN_STATE_KEY, plan);
                    await this.writeProgressFile(plan, stream);
                    task.output = `New plan created and saved to PROGRESS.md.`;
                    break;

                case 'update-task-status':
                    plan = this.state.get<Plan>(ProgressTrackingAgent.PLAN_STATE_KEY);
                    if (!plan) { throw new Error('No active plan to update.'); }
                    const taskToUpdate = plan.tasks.find(t => t.id === payload.taskId);
                    if (!taskToUpdate) { throw new Error(`Task with ID ${payload.taskId} not found in the active plan.`); }
                    taskToUpdate.status = payload.status;
                    await this.state.update(ProgressTrackingAgent.PLAN_STATE_KEY, plan);
                    await this.writeProgressFile(plan, stream);
                    task.output = `Task ${payload.taskId} status updated to ${payload.status} in PROGRESS.md.`;
                    break;

                case 'get-plan-status':
                    plan = this.state.get<Plan>(ProgressTrackingAgent.PLAN_STATE_KEY);
                    if (!plan) { throw new Error('No active plan found.'); }
                    const artifact: TaskArtifact = {
                        id: uuidv4(),
                        taskId: task.id,
                        type: 'plan_status',
                        data: plan,
                        description: 'Current status of the active plan'
                    };
                    task.artifacts.push(artifact);
                    stream({ type: 'artifact-created', artifact });
                    task.output = 'Retrieved current plan status.';
                    break;
                
                case 'clear-plan':
                    await this.state.update(ProgressTrackingAgent.PLAN_STATE_KEY, undefined);
                    await this.writeProgressFile(undefined, stream);
                    task.output = 'Active plan has been cleared and PROGRESS.md updated.';
                    break;

                default:
                    throw new Error(`Unsupported message type: ${messageType}`);
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

    private async writeProgressFile(plan: Plan | undefined, stream: (event: StreamEvent) => void): Promise<void> {
        let markdownContent = '# Project Progress\n\n';
        if (plan && plan.tasks.length > 0) {
            markdownContent += `## Goal\n${plan.goal}\n\n## Tasks\n`;
            const taskList = plan.tasks.map(task => {
                const checkbox = task.status === 'COMPLETED' ? '- [x]' : '- [ ]';
                return `${checkbox} ${task.description} (${task.status})`;
            }).join('\n');
            markdownContent += taskList;
        } else {
            markdownContent += 'No active project plan.';
        }

        const rootPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
        if (!rootPath) {
            stream({ type: 'log', message: 'Could not find workspace root to write PROGRESS.md' });
            return;
        }
        const filePath = path.join(rootPath, 'PROGRESS.md');

        try {
            await this.mcpClient.tool.call({ 
                toolName: 'FileWriteTool', 
                input: { filePath, content: markdownContent } 
            });
            stream({ type: 'log', message: 'PROGRESS.md has been updated.' });
        } catch (e: any) {
            stream({ type: 'log', message: `Failed to write to PROGRESS.md: ${e.message}` });
            // Do not throw an error here, as failing to write the progress file is not a critical task failure.
        }
    }
}
