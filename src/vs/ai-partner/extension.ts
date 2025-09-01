import * as vscode from 'vscode';
import { OrchestratorAgent } from './agents/OrchestratorAgent';
import { CodeAnalysisAgent } from './agents/CodeAnalysisAgent';
import { ContextManagementAgent } from './agents/ContextManagementAgent';
import { DocumentationGenerationAgent } from './agents/DocumentationGenerationAgent';
import { RefactoringSuggestionAgent } from './agents/RefactoringSuggestionAgent';
import { TestGenerationAgent } from './agents/TestGenerationAgent';
import { CodeExecutionAgent } from './agents/CodeExecutionAgent';
import { AILedLearningAgent } from './agents/AILedLearningAgent';
import { CodeWatcherAgent } from './agents/CodeWatcherAgent';
import { SecurityAnalysisAgent } from './agents/SecurityAnalysisAgent';
import { ContextArchiveAgent } from './agents/ContextArchiveAgent';
import { ReadmeGenerationAgent } from './agents/ReadmeGenerationAgent'; // Import the new agent
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
        // 1. Initialize core services.
        const configService = ConfigService.getInstance();
        developerLogService = DeveloperLogService.getInstance();
        const authService = AuthService.getInstance(configService);
        const mcpServer = new MCPServer();
        const llmService = new LLMService();
        const diagnosticCollection = vscode.languages.createDiagnosticCollection("aiPartner");
        context.subscriptions.push(diagnosticCollection);

        // 2. Instantiate the OrchestratorAgent.
        const orchestrator = new OrchestratorAgent(
            dispatchA2AMessage,
            mcpServer,
            llmService,
            authService,
            configService,
            context.workspaceState,
            diagnosticCollection,
            developerLogService
        );
        agentRegistry.set('OrchestratorAgent', orchestrator);

        // 3. Register other agents.
        const learningAgent = new AILedLearningAgent(context.workspaceState);
        agentRegistry.set('AILedLearningAgent', learningAgent);
        agentRegistry.set('ContextArchiveAgent', new ContextArchiveAgent(dispatchA2AMessage, context.workspaceState));
        agentRegistry.set('CodeAnalysisAgent', new CodeAnalysisAgent(dispatchA2AMessage, context.workspaceState));
        agentRegistry.set('ContextManagementAgent', new ContextManagementAgent(dispatchA2AMessage));
        agentRegistry.set('DocumentationGenerationAgent', new DocumentationGenerationAgent(dispatchA2AMessage, mcpServer, llmService));
        agentRegistry.set('RefactoringSuggestionAgent', new RefactoringSuggestionAgent(dispatchA2AMessage, mcpServer, llmService, learningAgent));
        agentRegistry.set('SecurityAnalysisAgent', new SecurityAnalysisAgent(dispatchA2AMessage, mcpServer));
        agentRegistry.set('TestGenerationAgent', new TestGenerationAgent(dispatchA2AMessage, llmService, configService));
        agentRegistry.set('CodeExecutionAgent', new CodeExecutionAgent(dispatchA2AMessage, mcpServer));
        // Register our new agent
        agentRegistry.set('ReadmeGenerationAgent', new ReadmeGenerationAgent(dispatchA2AMessage, mcpServer, llmService, configService));

        // 4. Activate background agents.
        codeWatcher = new CodeWatcherAgent(dispatchA2AMessage);
        agentRegistry.set('CodeWatcherAgent', codeWatcher);
        codeWatcher.activate();

        // 5. Instantiate the View Provider.
        const provider = new AIPartnerViewProvider(context.extensionUri);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(AIPartnerViewProvider.viewType, provider)
        );

        // 6. Implement the "Agent Host": a bridge between the UI and the agent system.
        provider.onDidReceiveMessage(async (message) => {
            if (message.command === 'viewVisible') {
                await orchestrator.handleSessionChange().catch(err => {
                    console.error('[AgentHost] handleSessionChange failed:', err);
                });
            } else {
                await orchestrator.handleUIMessage(message).catch(err => {
                    console.error('[AgentHost] handleUIMessage failed:', err);
                });
            }
        });

        orchestrator.onDidPostMessage((message: any) => {
            provider.postMessage(message);
        });

        // 7. Trigger initial background tasks.
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
