import * as vscode from 'vscode';
import * as path from 'path';
import { OrchestratorAgent } from './agents/OrchestratorAgent';
import { CodeAnalysisAgent } from './agents/CodeAnalysisAgent';
import { ContextManagementAgent } from './agents/ContextManagementAgent';
import { DocumentationGenerationAgent } from './agents/DocumentationGenerationAgent';
import { RefactoringSuggestionAgent } from './agents/RefactoringSuggestionAgent';
import { AILedLearningAgent } from './agents/AILedLearningAgent';
import { CodeWatcherAgent } from './agents/CodeWatcherAgent';
import { SecurityAnalysisAgent } from './agents/SecurityAnalysisAgent';
import { A2AMessage } from './interfaces/A2AMessage';
import { MCPServer } from './server/MCPServer';
import { LLMService } from './services/LLMService';

const agentRegistry = new Map<string, any>();

function dispatchA2AMessage(message: A2AMessage<any>) {
    const recipient = agentRegistry.get(message.recipient);
    if (recipient && typeof recipient.handleA2AMessage === 'function') {
        recipient.handleA2AMessage(message);
    } else {
        console.error(`A2A Error: Agent "${message.recipient}" not found or has no handler.`);
    }
}

let codeWatcher: CodeWatcherAgent;

export function activate(context: vscode.ExtensionContext) {
    console.log('AI Partner extension is now active.');

    const mcpServer = new MCPServer();
    const llmService = new LLMService();
    const diagnosticCollection = vscode.languages.createDiagnosticCollection("aiPartner");
    context.subscriptions.push(diagnosticCollection);

    // Pass dependencies to all agents that need them.
    agentRegistry.set('OrchestratorAgent', new OrchestratorAgent(dispatchA2AMessage, mcpServer, llmService, context.workspaceState, diagnosticCollection));
    agentRegistry.set('CodeAnalysisAgent', new CodeAnalysisAgent(dispatchA2AMessage));
    agentRegistry.set('ContextManagementAgent', new ContextManagementAgent(dispatchA2AMessage));
    agentRegistry.set('DocumentationGenerationAgent', new DocumentationGenerationAgent(dispatchA2AMessage, mcpServer, llmService));
    agentRegistry.set('RefactoringSuggestionAgent', new RefactoringSuggestionAgent(dispatchA2AMessage, mcpServer, llmService));
    agentRegistry.set('SecurityAnalysisAgent', new SecurityAnalysisAgent(dispatchA2AMessage, mcpServer));

    codeWatcher = new CodeWatcherAgent(dispatchA2AMessage);
    agentRegistry.set('CodeWatcherAgent', codeWatcher);
    codeWatcher.activate();

    // Provide workspaceState to the learning agent for persistence.
    agentRegistry.set('AILedLearningAgent', new AILedLearningAgent(dispatchA2AMessage, context.workspaceState));

    const startCommand = vscode.commands.registerCommand('ai-partner.start', () => {
        const panel = vscode.window.createWebviewPanel(
            'aiPartnerMainView', 'AI Partner', vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')] }
        );

        panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

        const orchestrator = agentRegistry.get('OrchestratorAgent');
        orchestrator.registerWebviewPanel(panel);

        panel.webview.onDidReceiveMessage(message => { orchestrator.handleUIMessage(message); }, undefined, context.subscriptions);
        panel.onDidDispose(() => { orchestrator.registerWebviewPanel(undefined); }, null, context.subscriptions);
    });

    context.subscriptions.push(startCommand);
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
    // ... (implementation remains the same)
}

function getNonce() {
    // ... (implementation remains the same)
}

export function deactivate() {
    if (codeWatcher) {
        codeWatcher.deactivate();
    }
}
