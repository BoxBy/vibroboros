import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';

/**
 * @class ContextManagementAgent
 * Responsible for selecting and providing the most relevant context from the IDE.
 */
export class ContextManagementAgent {
    private static readonly AGENT_ID = 'ContextManagementAgent';
    private dispatch: (message: A2AMessage<any>) => void;

    constructor(dispatch: (message: A2AMessage<any>) => void) {
        this.dispatch = dispatch;
    }

    /**
     * Handles incoming A2A messages, such as a request for context.
     * @param message The A2A message to process.
     */
    public handleA2AMessage(message: A2AMessage<any>): void {
        console.log(`[${ContextManagementAgent.AGENT_ID}] Received message:`, message);

        if (message.type === 'request-context') {
            this.gatherAndDispatchContext(message.payload.query);
        }
    }

    /**
     * Gathers relevant context from the VSCode environment and dispatches it.
     * @param query A description of the task for which context is needed.
     */
    private gatherAndDispatchContext(query: string): void {
        console.log(`[${ContextManagementAgent.AGENT_ID}] Gathering context for query:`, query);

        const activeEditor = vscode.window.activeTextEditor;
        const openFiles = vscode.workspace.textDocuments.map(doc => doc.uri.fsPath);

        let context = {
            query,
            activeFilePath: 'N/A',
            language: 'N/A',
            contentPreview: 'N/A',
            openFiles,
        };

        if (activeEditor) {
            const document = activeEditor.document;
            context.activeFilePath = document.uri.fsPath;
            context.language = document.languageId;
            context.contentPreview = document.getText().substring(0, 1000); // Get first 1000 chars
        }

        // Dispatch the gathered context back to the orchestrator.
        this.dispatch({
            sender: ContextManagementAgent.AGENT_ID,
            recipient: 'OrchestratorAgent',
            timestamp: new Date().toISOString(),
            type: 'response-context',
            payload: context,
        });
    }
}
