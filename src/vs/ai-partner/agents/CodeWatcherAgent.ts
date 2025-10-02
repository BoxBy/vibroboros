
// import * as vscode from 'vscode';
// import { AgentExecutor, AgentCard, Task, TaskStatus, StreamEvent, GetRequest, SendMessageRequest, A2AClient } from "@a2a-js/sdk";
// import { v4 as uuidv4 } from 'uuid';

// export class CodeWatcherAgent implements AgentExecutor {
//     private disposables: vscode.Disposable[] = [];
//     private securityAgentClient: A2AClient;
//     private codeAnalysisClient: A2AClient;

//     constructor(agentBaseUrl: string, private card: AgentCard) {
//         this.securityAgentClient = new A2AClient({ baseUrl: `${agentBaseUrl}/agent/security-analysis` });
//         this.codeAnalysisClient = new A2AClient({ baseUrl: `${agentBaseUrl}/agent/code-analysis` });
//         this.activate();
//     }

//     private activate() {
//         // ... (implementation remains the same)
//     }

//     public deactivate() {
//         // ... (implementation remains the same)
//     }

//     private handleFileSave(document: vscode.TextDocument) {
//         // ... (implementation remains the same)
//     }

//     getAgentCard(): Promise<AgentCard> {
//         return Promise.resolve(this.card);
//     }

//     // ... (rest of the methods are the same)
// }


import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';

/**
 * @class CodeWatcherAgent
 * A background agent that monitors file changes and triggers proactive analysis and re-indexing.
 */
export class CodeWatcherAgent {
    private static readonly AGENT_ID = 'CodeWatcherAgent';
    private dispatch: (message: A2AMessage<any>) => void;
    private disposables: vscode.Disposable[] = [];

    constructor(dispatch: (message: A2AMessage<any>) => void) {
        this.dispatch = dispatch;
    }

    /**
     * Activates the file watcher.
     */
    public activate() {
        const onSaveDisposable = vscode.workspace.onDidSaveTextDocument(document => {
            this.handleFileSave(document);
        });
        this.disposables.push(onSaveDisposable);
        console.log(`[${CodeWatcherAgent.AGENT_ID}] Activated and is now watching for file saves.`);
    }

    /**
     * Deactivates the file watcher and cleans up disposables.
     */
    public deactivate() {
        this.disposables.forEach(d => d.dispose());
        console.log(`[${CodeWatcherAgent.AGENT_ID}] Deactivated.`);
    }

    /**
     * Handles the file save event by dispatching analysis and re-indexing requests.
     * @param document The document that was saved.
     */
    private handleFileSave(document: vscode.TextDocument) {
        console.log(`[${CodeWatcherAgent.AGENT_ID}] Detected save for:`, document.uri.fsPath);

        if (document.uri.scheme !== 'file') {
            return;
        }

        const filePath = document.uri.fsPath;

        // Trigger a security scan (fast, non-LLM)
        this.dispatch({
            sender: CodeWatcherAgent.AGENT_ID,
            recipient: 'SecurityAnalysisAgent',
            timestamp: new Date().toISOString(),
            type: 'request-security-analysis',
            payload: { filePath }
        });

        // Trigger a re-index of the saved file to keep the codebase index fresh.
        this.dispatch({
            sender: CodeWatcherAgent.AGENT_ID,
            recipient: 'CodeAnalysisAgent',
            timestamp: new Date().toISOString(),
            type: 'request-reindex-file',
            payload: { filePath }
        });
    }
}
