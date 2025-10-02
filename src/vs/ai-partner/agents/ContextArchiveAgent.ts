import * as vscode from 'vscode';
import { AgentExecutor, AgentCard, Task, TaskStatus, GetRequest, SendMessageRequest, TaskArtifact, StreamEvent } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';

const taskStore = new Map<string, Task>();

export class ContextArchiveAgent implements AgentExecutor {
    private static readonly CODE_ARCHIVE_KEY = 'aiPartnerCodeArchive';
    private static readonly NON_CODE_ARCHIVE_KEY = 'aiPartnerNonCodeArchive';

    private codeArchive: string[] = [];
    private nonCodeArchive: string[] = [];

    constructor(private state: vscode.Memento, private card: AgentCard) {
        this.codeArchive = this.state.get<string[]>(ContextArchiveAgent.CODE_ARCHIVE_KEY, []);
        this.nonCodeArchive = this.state.get<string[]>(ContextArchiveAgent.NON_CODE_ARCHIVE_KEY, []);
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
        this.processTask(task, (event) => { console.log('StreamEvent:', event); });

        return task;
    }

    private async processTask(task: Task, stream: (event: StreamEvent) => void): Promise<void> {
        try {
            task.status = TaskStatus.RUNNING;
            taskStore.set(task.id, task);
            stream({ type: 'status-changed', status: TaskStatus.RUNNING });

            const messageType = task.request.message.metadata?.type;
            const content = task.request.message.content;

            if (messageType === 'archiveContext') {
                await this.archiveContext(content as string, stream);
                task.output = 'Content archived successfully.';
            } else if (messageType === 'searchArchivedContext') {
                const results = this.searchArchivedContext(content as string, stream);
                const artifact: TaskArtifact = {
                    id: uuidv4(),
                    taskId: task.id,
                    type: 'search_result',
                    data: results,
                    description: `Search results for query: "${content}"`
                };
                task.artifacts.push(artifact);
                stream({ type: 'artifact-created', artifact });
                task.output = `Found ${results.length} results.`;
            } else {
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

    private async archiveContext(content: string, stream: (event: StreamEvent) => void): Promise<void> {
        if (typeof content !== 'string') {
            return;
        }
        stream({ type: 'log', message: `Archiving content...` });
        // Use markdown code fences to determine if the content is code
        if (content.includes('```')) {
            this.codeArchive.push(content);
            await this.state.update(ContextArchiveAgent.CODE_ARCHIVE_KEY, this.codeArchive);
            stream({ type: 'log', message: `Content archived to CODE archive.` });
        } else {
            this.nonCodeArchive.push(content);
            await this.state.update(ContextArchiveAgent.NON_CODE_ARCHIVE_KEY, this.nonCodeArchive);
            stream({ type: 'log', message: `Content archived to NON-CODE archive.` });
        }
    }

    private searchArchivedContext(query: string, stream: (event: StreamEvent) => void): string[] {
        stream({ type: 'log', message: `Searching archives for query: "${query}"` });
        const queryLower = query.toLowerCase();
        let results: string[] = [];

        // Search non-code archive first
        results = this.nonCodeArchive.filter(item => item.toLowerCase().includes(queryLower));
        stream({ type: 'log', message: `Found ${results.length} matches in non-code archive.` });

        // If no results in non-code, and query suggests code, search code archive
        if (results.length === 0) {
            const codeKeywords = ['code', 'function', 'method', 'class', 'snippet'];
            if (codeKeywords.some(kw => queryLower.includes(kw))) {
                stream({ type: 'log', message: `Query suggests code, searching code archive...` });
                results = this.codeArchive.filter(item => item.toLowerCase().includes(queryLower));
                stream({ type: 'log', message: `Found ${results.length} matches in code archive.` });
            }
        }

        return results.slice(0, 10); // Return top 10 matches
    }
}
