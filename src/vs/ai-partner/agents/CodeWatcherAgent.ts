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
