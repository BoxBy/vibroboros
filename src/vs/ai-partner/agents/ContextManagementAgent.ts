
// import * as vscode from 'vscode';
// import * as path from 'path';
// import { AgentExecutor, AgentCard, Task, TaskStatus, StreamEvent, GetRequest, SendMessageRequest, TaskArtifact, A2AClient } from "@a2a-js/sdk";
// import { v4 as uuidv4 } from 'uuid';

// const taskStore = new Map<string, Task>();

// export class ContextManagementAgent implements AgentExecutor {
//     private codeAnalysisClient: A2AClient;

//     constructor(agentBaseUrl: string, private card: AgentCard) {
//         this.codeAnalysisClient = new A2AClient({ baseUrl: `${agentBaseUrl}/agent/code-analysis` });
//     }

//     getAgentCard(): Promise<AgentCard> {
//         return Promise.resolve(this.card);
//     }

//     // ... (rest of the methods are the same)
// }


import * as vscode from 'vscode';
import * as path from 'path';
import { A2AMessage } from '../interfaces/A2AMessage';

interface PendingContext {
    originalQuery: string;
    activeFilePath: string;
    uiLanguage: string; // File language와 구분하기 위해 이름 변경
    contentPreview: string;
    openFiles: string[];
    folderOverview: string;
}

/**
 * @class ContextManagementAgent
 * Uses codebase search to find relevant code snippets from across the entire project to provide rich context.
 */
export class ContextManagementAgent {
    private static readonly AGENT_ID = 'ContextManagementAgent';
    private dispatch: (message: A2AMessage<any>) => void;
    private pendingContext: PendingContext | null = null;

    constructor(dispatch: (message: A2AMessage<any>) => void) {
        this.dispatch = dispatch;
    }

    public async handleA2AMessage(message: A2AMessage<any>): Promise<void> {
        switch (message.type) {
            case 'request-context':
                await this.handleContextRequest(message.payload.query);
                break;

            case 'response-codebase-search':
                await this.handleSearchResponse(message.payload.results);
                break;
        }
    }

    private async handleContextRequest(query: string): Promise<void> {
        console.log(`[${ContextManagementAgent.AGENT_ID}] Gathering context for query:`, query);

        const activeEditor = vscode.window.activeTextEditor;
        const openFiles = vscode.workspace.textDocuments.map(doc => doc.uri.fsPath);
        const activeFilePath = activeEditor ? activeEditor.document.uri.fsPath : 'N/A';
        let folderOverviewContent = 'N/A';

        if (activeEditor) {
            const dirPath = path.dirname(activeEditor.document.uri.fsPath);
            const overviewPath = path.join(dirPath, '_folder_overview.md');
            try {
                const overviewUri = vscode.Uri.file(overviewPath);
                const overviewContentBytes = await vscode.workspace.fs.readFile(overviewUri);
                folderOverviewContent = Buffer.from(overviewContentBytes).toString('utf-8');
            } catch (error) {
                console.log(`[ContextManagementAgent] Could not find or read _folder_overview.md at ${overviewPath}`);
                folderOverviewContent = 'No folder overview file found for the current directory.';
            }
        }

        this.pendingContext = {
            originalQuery: query,
            activeFilePath,
            uiLanguage: vscode.env.language, // VSCode UI 언어 정보 수집
            contentPreview: activeEditor ? activeEditor.document.getText().substring(0, 1000) : 'N/A',
            openFiles,
            folderOverview: folderOverviewContent,
        };

        // Simple regex to find potential function/class names in a query.
        const symbolMatch = query.match(/\b([A-Za-z_][A-Za-z0-9_]+)\b/);
        const symbolName = symbolMatch ? symbolMatch[1] : null;

        if (symbolName && symbolName.length > 3) { // Avoid searching for very short words
            console.log(`[${ContextManagementAgent.AGENT_ID}] Found potential symbol '${symbolName}', searching codebase.`);
            this.dispatch({
                sender: ContextManagementAgent.AGENT_ID,
                recipient: 'CodeAnalysisAgent',
                timestamp: new Date().toISOString(),
                type: 'request-codebase-search',
                payload: { symbolName }
            });
        } else {
            // No relevant symbol found, respond immediately with basic context.
            this.dispatch({
                sender: ContextManagementAgent.AGENT_ID,
                recipient: 'OrchestratorAgent',
                timestamp: new Date().toISOString(),
                type: 'response-context',
                payload: this.pendingContext,
            });
            this.pendingContext = null;
        }
    }

    private async handleSearchResponse(searchResults: any[]): Promise<void> {
        if (!this.pendingContext) {
            console.error(`[${ContextManagementAgent.AGENT_ID}] Received search response but have no pending context.`);
            return;
        }

        console.log(`[${ContextManagementAgent.AGENT_ID}] Received codebase search results.`);

        const finalContext = {
            ...this.pendingContext,
            codebaseSearchResults: searchResults,
        };

        this.dispatch({
            sender: ContextManagementAgent.AGENT_ID,
            recipient: 'OrchestratorAgent',
            timestamp: new Date().toISOString(),
            type: 'response-context',
            payload: finalContext,
        });

        this.pendingContext = null;
    }
}
