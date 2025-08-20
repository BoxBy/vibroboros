import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';

/**
 * @class CodeWatcherAgent
 * A background agent that monitors file changes and triggers proactive analysis.
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
     * Handles the file save event by dispatching analysis requests to specialized agents.
     * @param document The document that was saved.
     */
    private handleFileSave(document: vscode.TextDocument) {
        console.log(`[${CodeWatcherAgent.AGENT_ID}] Detected save for:`, document.uri.fsPath);

        // For efficiency, we can add logic here to ignore certain files (e.g., in node_modules, or non-code files)
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

        // We can also trigger a proactive refactoring suggestion check here in the future.
        // For now, we focus on the security aspect to manage LLM costs.
        /*
        this.dispatch({
            sender: CodeWatcherAgent.AGENT_ID,
            recipient: 'RefactoringSuggestionAgent',
            timestamp: new Date().toISOString(),
            type: 'request-proactive-refactoring-check',
            payload: { filePath }
        });
        */
    }
}
