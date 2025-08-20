import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';
import { MCPServer } from '../server/MCPServer';

type ChatMessage = { author: 'user' | 'agent', content: any[] };

/**
 * @class OrchestratorAgent
 * The central agent responsible for directing the overall workflow and managing state.
 */
export class OrchestratorAgent {
    private static readonly AGENT_ID = 'OrchestratorAgent';
    private static readonly CHAT_HISTORY_KEY = 'aiPartnerChatHistory';

    private dispatch: (message: A2AMessage<any>) => void;
    private mcpServer: MCPServer;
    private webviewPanel: vscode.WebviewPanel | undefined;
    private state: vscode.Memento;
    private chatHistory: ChatMessage[] = [];

    constructor(dispatch: (message: A2AMessage<any>) => void, mcpServer: MCPServer, state: vscode.Memento) {
        this.dispatch = dispatch;
        this.mcpServer = mcpServer;
        this.state = state;
        this.chatHistory = this.state.get<ChatMessage[]>(OrchestratorAgent.CHAT_HISTORY_KEY, []);
    }

    public registerWebviewPanel(panel: vscode.WebviewPanel | undefined): void {
        this.webviewPanel = panel;
        console.log(`[${OrchestratorAgent.AGENT_ID}] Webview panel registered.`);
        if (panel) {
            this.postMessageToUI({ command: 'loadHistory', payload: this.chatHistory });
        }
    }

    public handleUIMessage(message: any): void {
        console.log(`[${OrchestratorAgent.AGENT_ID}] Received UI message:`, message);

        if (message.command === 'loadSettings' || message.command === 'saveSettings') {
            this.handleSettingsCommands(message);
            return;
        }

        const userText = this.getUserTextFromUIMessage(message);
        const userMessage: ChatMessage = { author: 'user', content: [{ type: 'text', text: userText }] };
        this.addMessageToHistory(userMessage);

        // For general queries, first get context, then decide the next step.
        if (message.command === 'askGeneralQuestion') {
            this.dispatch({ sender: OrchestratorAgent.AGENT_ID, recipient: 'ContextManagementAgent', timestamp: new Date().toISOString(), type: 'request-context', payload: { query: message.query } });
        } else {
            this.routeCommand(message);
        }
    }

    public handleA2AMessage(message: A2AMessage<any>): void {
        console.log(`[${OrchestratorAgent.AGENT_ID}] Received A2A message:`, message);
        switch (message.type) {
            case 'response-context':
                // For now, just display the context. In the future, this would be sent to an LLM.
                const contextText = `Context Found:\n- Active File: ${message.payload.activeFilePath}\n- Language: ${message.payload.language}\n- Open Files: ${message.payload.openFiles.length}`;
                const contextResponse: ChatMessage = { author: 'agent', content: [{ type: 'text', text: contextText }] };
                this.addMessageToHistory(contextResponse);
                this.postMessageToUI({ command: 'response', payload: contextResponse });
                break;
            case 'response-code-summary':
                this.dispatch({ sender: OrchestratorAgent.AGENT_ID, recipient: 'DocumentationGenerationAgent', timestamp: new Date().toISOString(), type: 'request-documentation-generation', payload: { codeSummary: message.payload } });
                break;
            case 'response-documentation-generation':
                const docResponse: ChatMessage = { author: 'agent', content: [{ type: 'text', text: message.payload.documentation }] };
                this.addMessageToHistory(docResponse);
                this.postMessageToUI({ command: 'response', payload: docResponse });
                break;
            default:
                const defaultResponse: ChatMessage = { author: 'agent', content: [{ type: 'text', text: JSON.stringify(message.payload) }] };
                this.addMessageToHistory(defaultResponse);
                this.postMessageToUI({ command: 'response', payload: defaultResponse });
                break;
        }
    }

    private routeCommand(message: any): void {
        switch (message.command) {
            case 'analyzeActiveFile':
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    this.dispatch({ sender: OrchestratorAgent.AGENT_ID, recipient: 'CodeAnalysisAgent', timestamp: new Date().toISOString(), type: 'request-code-analysis', payload: { filePath: activeEditor.document.uri.fsPath } });
                } else {
                    this.sendErrorToUI('No active file open to analyze.');
                }
                break;
            case 'gitStatus':
                this.sendMCPRequest('GitAutomationTool', { args: ['status'] });
                break;
            case 'runTerminalCommand':
                this.sendMCPRequest('TerminalExecutionTool', { command: message.commandString });
                break;
        }
    }

    private async sendMCPRequest(tool: string, params: Record<string, any>): Promise<void> {
        const request = { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'tools/call', params: { name: tool, arguments: params } };
        let response;
        try {
            response = await this.mcpServer.handleRequest(request);
        } catch (error: any) {
            response = { error: { message: error.message || 'Failed to execute tool.' } };
        }
        const agentResponse: ChatMessage = { author: 'agent', content: response.result?.content || [{ type: 'text', text: `Error: ${response.error?.message}` }] };
        this.addMessageToHistory(agentResponse);
        this.postMessageToUI({ command: 'response', payload: agentResponse });
    }

    private handleSettingsCommands(message: any): void {
        if (message.command === 'loadSettings') {
            const config = vscode.workspace.getConfiguration('aiPartner');
            this.postMessageToUI({ command: 'loadSettingsResponse', payload: { mcpServerUrl: config.get('mcpServerUrl'), llmApiKey: config.get('llmApiKey') } });
        } else if (message.command === 'saveSettings') {
            const config = vscode.workspace.getConfiguration('aiPartner');
            config.update('mcpServerUrl', message.payload.mcpServerUrl, vscode.ConfigurationTarget.Global);
            config.update('llmApiKey', message.payload.llmApiKey, vscode.ConfigurationTarget.Global);
        }
    }

    private getUserTextFromUIMessage(message: any): string {
        if (message.command === 'analyzeActiveFile') return 'Analyze the active file';
        if (message.command === 'gitStatus') return 'Get Git status';
        return message.query || message.commandString;
    }

    private sendErrorToUI(errorMessage: string): void {
        const errorResponse: ChatMessage = { author: 'agent', content: [{ type: 'text', text: `Error: ${errorMessage}` }] };
        this.addMessageToHistory(errorResponse);
        this.postMessageToUI({ command: 'response', payload: errorResponse });
    }

    private addMessageToHistory(message: ChatMessage): void {
        this.chatHistory.push(message);
        this.state.update(OrchestratorAgent.CHAT_HISTORY_KEY, this.chatHistory);
    }

    private postMessageToUI(message: any): void {
        if (this.webviewPanel) {
            this.webviewPanel.webview.postMessage(message);
        }
    }
}
