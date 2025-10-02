import * as vscode from 'vscode';
import * as path from 'path';
import { AgentExecutor, AgentCard, Task, TaskStatus, GetRequest, SendMessageRequest, TaskArtifact, StreamEvent, A2AClient } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';

const taskStore = new Map<string, Task>();

export class ContextManagementAgent implements AgentExecutor {
    private codeAnalysisClient: A2AClient;

    constructor(agentBaseUrl: string, private card: AgentCard) {
        this.codeAnalysisClient = new A2AClient({ baseUrl: `${agentBaseUrl}/agent/code-analysis` });
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

        this.processContextRequest(task, (event) => { console.log('StreamEvent:', event); });

        return task;
    }

    private async processContextRequest(task: Task, stream: (event: StreamEvent) => void): Promise<void> {
        try {
            task.status = TaskStatus.RUNNING;
            taskStore.set(task.id, task);
            stream({ type: 'status-changed', status: TaskStatus.RUNNING });

            const query = task.request.message.content as string;
            stream({ type: 'log', message: `Gathering context for query: ${query}` });

            // 1. Gather basic context
            const activeEditor = vscode.window.activeTextEditor;
            const openFiles = vscode.workspace.textDocuments.map(doc => doc.uri.fsPath);
            const activeFilePath = activeEditor ? activeEditor.document.uri.fsPath : 'N/A';
            const folderOverviewContent = await this.getFolderOverview(activeEditor);

            let basicContext: any = {
                originalQuery: query,
                activeFilePath,
                uiLanguage: vscode.env.language,
                contentPreview: activeEditor ? activeEditor.document.getText().substring(0, 2000) : 'N/A',
                openFiles,
                folderOverview: folderOverviewContent,
            };

            // 2. Search for symbols in the query
            const symbolMatch = query.match(/\b([A-Za-z_][A-Za-z0-9_]{4,})\b/); // Match longer symbols
            const symbolName = symbolMatch ? symbolMatch[1] : null;

            // 3. If symbol found, call CodeAnalysisAgent
            if (symbolName) {
                stream({ type: 'log', message: `Found potential symbol '${symbolName}', searching codebase.` });
                const searchTask = await this.codeAnalysisClient.sendMessage({
                    message: {
                        content: { symbolName },
                        metadata: { type: 'request-codebase-search' }
                    }
                });
                // Assuming sendMessage resolves with the completed task, we can get artifacts.
                basicContext.codebaseSearchResults = searchTask.artifacts;
                stream({ type: 'log', message: `Codebase search completed.` });
            }

            // 4. Create final artifact
            const artifact: TaskArtifact = {
                id: uuidv4(),
                taskId: task.id,
                type: 'context_summary',
                data: basicContext,
                description: 'Combined context for the user query'
            };
            task.artifacts.push(artifact);
            stream({ type: 'artifact-created', artifact });

            task.status = TaskStatus.COMPLETED;
            task.output = 'Context gathered successfully.';
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

    private async getFolderOverview(activeEditor: vscode.TextEditor | undefined): Promise<string> {
        if (!activeEditor) {
            return 'N/A';
        }
        const dirPath = path.dirname(activeEditor.document.uri.fsPath);
        const overviewPath = path.join(dirPath, '_folder_overview.md');
        try {
            const overviewUri = vscode.Uri.file(overviewPath);
            const overviewContentBytes = await vscode.workspace.fs.readFile(overviewUri);
            return Buffer.from(overviewContentBytes).toString('utf-8');
        } catch (error) {
            return 'No folder overview file found for the current directory.';
        }
    }
}
