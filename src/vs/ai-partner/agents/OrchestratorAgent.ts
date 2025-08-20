import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';
import { MCPServer } from '../server/MCPServer';
import { LLMService } from '../services/LLMService';

type ChatMessage = { author: 'user' | 'agent', content: any[] };
type LlmMessage = { role: 'system' | 'user' | 'assistant' | 'tool', content: string | null, tool_calls?: any[], tool_call_id?: string, name?: string };

export class OrchestratorAgent {
    private static readonly AGENT_ID = 'OrchestratorAgent';
    private static readonly CHAT_HISTORY_KEY = 'aiPartnerChatHistory';

    private dispatch: (message: A2AMessage<any>) => void;
    private mcpServer: MCPServer;
    private llmService: LLMService;
    private state: vscode.Memento;
    private diagnosticCollection: vscode.DiagnosticCollection;
    private webviewPanel: vscode.WebviewPanel | undefined;
    private chatHistory: ChatMessage[] = [];
    private llmConversationHistory: LlmMessage[] = [];

    constructor(
        dispatch: (message: A2AMessage<any>) => void,
        mcpServer: MCPServer,
        llmService: LLMService,
        state: vscode.Memento,
        diagnosticCollection: vscode.DiagnosticCollection
    ) {
        this.dispatch = dispatch;
        this.mcpServer = mcpServer;
        this.llmService = llmService;
        this.state = state;
        this.diagnosticCollection = diagnosticCollection;
        this.chatHistory = this.state.get<ChatMessage[]>(OrchestratorAgent.CHAT_HISTORY_KEY, []);
    }

    public registerWebviewPanel(panel: vscode.WebviewPanel | undefined): void {
        this.webviewPanel = panel;
        if (panel) {
            this.postMessageToUI({ command: 'loadHistory', payload: this.chatHistory });
        }
    }

    public handleUIMessage(message: any): void {
        if (message.command.includes('Settings') || message.command.includes('FileProtection') || message.command === 'executeTool' || message.command === 'userFeedback') {
            this.handleSystemCommands(message);
            return;
        }

        const userText = this.getUserTextFromUIMessage(message);
        const userMessage: ChatMessage = { author: 'user', content: [{ type: 'text', text: userText }] };
        this.addMessageToHistory(userMessage);

        const lowerCaseQuery = userText.toLowerCase();
        if (lowerCaseQuery.includes('refactor') || lowerCaseQuery.includes('improve') || lowerCaseQuery.includes('rewrite')) {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                this.dispatch({ sender: OrchestratorAgent.AGENT_ID, recipient: 'RefactoringSuggestionAgent', timestamp: new Date().toISOString(), type: 'request-refactoring-suggestions', payload: { filePath: activeEditor.document.uri.fsPath, query: userText } });
            } else {
                this.sendErrorToUI('Please open a file to refactor.');
            }
            return;
        }

        if (lowerCaseQuery.includes('document') || lowerCaseQuery.includes('docs') || lowerCaseQuery.includes('explain') || lowerCaseQuery.includes('comment')) {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                this.dispatch({ sender: OrchestratorAgent.AGENT_ID, recipient: 'DocumentationGenerationAgent', timestamp: new Date().toISOString(), type: 'request-documentation-generation', payload: { filePath: activeEditor.document.uri.fsPath, query: userText } });
            } else {
                this.sendErrorToUI('Please open a file to document.');
            }
            return;
        }

        this.llmConversationHistory = [{ role: 'user', content: userText }];
        this.dispatch({ sender: OrchestratorAgent.AGENT_ID, recipient: 'ContextManagementAgent', timestamp: new Date().toISOString(), type: 'request-context', payload: { query: userText } });
    }

    public async handleA2AMessage(message: A2AMessage<any>): Promise<void> {
        // ... (implementation remains the same)
    }

    private handleSystemCommands(message: any): void {
        const config = vscode.workspace.getConfiguration('aiPartner');
        switch (message.command) {
            case 'loadSettings':
                this.postMessageToUI({ command: 'loadSettingsResponse', payload: { mcpServerUrl: config.get('mcpServerUrl'), llmApiKey: config.get('llmApiKey'), fileProtection: config.get('fileProtectionEnabled', true) } });
                break;
            case 'saveSettings':
                config.update('mcpServerUrl', message.payload.mcpServerUrl, vscode.ConfigurationTarget.Global);
                config.update('llmApiKey', message.payload.llmApiKey, vscode.ConfigurationTarget.Global);
                break;
            case 'setFileProtection':
                config.update('fileProtectionEnabled', message.payload.enabled, vscode.ConfigurationTarget.Global);
                break;
            case 'executeTool':
                this.sendMCPRequest(message.payload.toolName, message.payload.arguments).then(result => {
                    const toolResponse: ChatMessage = { author: 'agent', content: result };
                    this.addMessageToHistory(toolResponse);
                    this.postMessageToUI({ command: 'response', payload: toolResponse });
                });
                break;
            case 'userFeedback':
                this.dispatch({
                    sender: OrchestratorAgent.AGENT_ID,
                    recipient: 'AILedLearningAgent',
                    timestamp: new Date().toISOString(),
                    type: 'log-user-feedback',
                    payload: message.payload // { suggestionId, suggestionType, accepted }
                });
                break;
        }
    }

    // ... (rest of the agent implementation remains the same)
}
