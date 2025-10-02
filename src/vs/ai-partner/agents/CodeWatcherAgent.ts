import * as vscode from 'vscode';
import { AgentExecutor, AgentCard, Task, TaskStatus, GetRequest, SendMessageRequest, A2AClient, StreamEvent } from "@a2a-js/sdk";

export class CodeWatcherAgent implements AgentExecutor {
    private disposables: vscode.Disposable[] = [];
    private securityAgentClient: A2AClient;
    private codeAnalysisClient: A2AClient;

    constructor(agentBaseUrl: string, private card: AgentCard) {
        // Construct clients to communicate with other agents
        this.securityAgentClient = new A2AClient({ baseUrl: `${agentBaseUrl}/agent/security-analysis` });
        this.codeAnalysisClient = new A2AClient({ baseUrl: `${agentBaseUrl}/agent/code-analysis` });
        this.activate();
    }

    private activate(): void {
        const onSaveDisposable = vscode.workspace.onDidSaveTextDocument(document => {
            this.handleFileSave(document);
        });
        this.disposables.push(onSaveDisposable);
        console.log(`[CodeWatcherAgent] Activated and is now watching for file saves.`);
    }

    public deactivate(): void {
        this.disposables.forEach(d => d.dispose());
        console.log(`[CodeWatcherAgent] Deactivated.`);
    }

    private handleFileSave(document: vscode.TextDocument): void {
        console.log(`[CodeWatcherAgent] Detected save for:`, document.uri.fsPath);

        if (document.uri.scheme !== 'file') {
            return;
        }

        const filePath = document.uri.fsPath;

        // Asynchronously trigger a security scan (fast, non-LLM)
        this.securityAgentClient.sendMessage({
            message: {
                content: { filePath }, // Payload for the security agent
                metadata: { type: 'request-security-analysis' }
            }
        }).catch(error => console.error('[CodeWatcherAgent] Failed to send security analysis request:', error));

        // Asynchronously trigger a re-index of the saved file to keep the codebase index fresh.
        this.codeAnalysisClient.sendMessage({
            message: {
                content: { filePath }, // Payload for the code analysis agent
                metadata: { type: 'request-reindex-file' }
            }
        }).catch(error => console.error('[CodeWatcherAgent] Failed to send re-index request:', error));
    }

    getAgentCard(): Promise<AgentCard> {
        return Promise.resolve(this.card);
    }

    // This agent is a background service and does not manage tasks in the standard way.
    getTask(req: GetRequest): Promise<Task> {
        return Promise.reject(new Error("Task management is not applicable to CodeWatcherAgent."));
    }

    sendMessage(req: SendMessageRequest): Promise<Task> {
        return Promise.reject(new Error("Sending direct messages is not applicable to CodeWatcherAgent."));
    }
}
