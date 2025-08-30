import * as vscode from 'vscode';
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
import { AIPartnerViewProvider } from './AIPartnerViewProvider';
import { LLMService } from './services/LLMService';
import { AuthService } from './auth_service';
import { ConfigService } from './config_service';
import { DeveloperLogService } from './services/DeveloperLogService';

const agentRegistry = new Map<string, any>();

async function dispatchA2AMessage(message: A2AMessage<any>) {
    const recipient = agentRegistry.get(message.recipient);
    if (recipient && typeof recipient.handleA2AMessage === 'function') {
        try {
            await recipient.handleA2AMessage(message);
        } catch (error: any) {
            console.error(`A2A Error during message dispatch to "${message.recipient}":`, error);
            vscode.window.showErrorMessage(`An internal error occurred in the AI Partner: ${error.message}`);
        }
    } else {
        console.error(`A2A Error: Agent "${message.recipient}" not found or has no handler.`);
    }
}

let codeWatcher: CodeWatcherAgent;
let developerLogService: DeveloperLogService;

export function activate(context: vscode.ExtensionContext) {
    console.log('AI Partner extension is now active.');

    try {
        // 1. Initialize core services in the correct order.
        const configService = ConfigService.getInstance();
        developerLogService = DeveloperLogService.getInstance();
        const authService = AuthService.getInstance(configService);
        const mcpServer = new MCPServer();
        const llmService = new LLMService();
        const diagnosticCollection = vscode.languages.createDiagnosticCollection("aiPartner");
        context.subscriptions.push(diagnosticCollection);

        // 2. Register all agents, injecting their required dependencies.
        const orchestrator = new OrchestratorAgent(
            dispatchA2AMessage,
            mcpServer,
            llmService,
            authService,
            configService,
            context.workspaceState,
            diagnosticCollection,
            developerLogService // Inject the logger
        );
        agentRegistry.set('OrchestratorAgent', orchestrator);

        const learningAgent = new AILedLearningAgent(context.workspaceState);
        agentRegistry.set('AILedLearningAgent', learningAgent);

        agentRegistry.set('CodeAnalysisAgent', new CodeAnalysisAgent(dispatchA2AMessage, context.workspaceState));
        agentRegistry.set('ContextManagementAgent', new ContextManagementAgent(dispatchA2AMessage));
        agentRegistry.set('DocumentationGenerationAgent', new DocumentationGenerationAgent(dispatchA2AMessage, mcpServer, llmService));
        agentRegistry.set('RefactoringSuggestionAgent', new RefactoringSuggestionAgent(dispatchA2AMessage, mcpServer, llmService, learningAgent));
        agentRegistry.set('SecurityAnalysisAgent', new SecurityAnalysisAgent(dispatchA2AMessage, mcpServer));

        // 3. Activate background agents.
        codeWatcher = new CodeWatcherAgent(dispatchA2AMessage);
        agentRegistry.set('CodeWatcherAgent', codeWatcher);
        codeWatcher.activate();

        // 4. Register the View Provider, passing only the orchestrator.
        const provider = new AIPartnerViewProvider(context.extensionUri, orchestrator);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(AIPartnerViewProvider.viewType, provider));

        // 5. Trigger the initial codebase indexing.
        setTimeout(() => {
            dispatchA2AMessage({ sender: 'extension', recipient: 'CodeAnalysisAgent', type: 'request-initial-index', payload: {}, timestamp: new Date().toISOString() });
        }, 2000);

    } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to activate AI Partner: ${e.message}`);
        console.error("Error during activation:", e);
    }
}

export function deactivate() {
    if (codeWatcher) {
        codeWatcher.deactivate();
    }
    if (developerLogService) {
        developerLogService.dispose();
    }
}
