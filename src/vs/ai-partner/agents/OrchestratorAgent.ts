import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';
import { MCPServer } from '../server/MCPServer';
import { LLMService } from '../services/LLMService';

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
    private llmService: LLMService;
    private lastUserQuery: string = '';

    constructor(dispatch: (message: A2AMessage<any>) => void, mcpServer: MCPServer, state: vscode.Memento) {
        this.dispatch = dispatch;
        this.mcpServer = mcpServer;
        this.state = state;
        this.llmService = new LLMService();
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

        if (message.command === 'askGeneralQuestion') {
            this.lastUserQuery = message.query;
            this.dispatch({ sender: OrchestratorAgent.AGENT_ID, recipient: 'ContextManagementAgent', timestamp: new Date().toISOString(), type: 'request-context', payload: { query: message.query } });
        } else {
            this.routeCommand(message);
        }
    }

    public async handleA2AMessage(message: A2AMessage<any>): Promise<void> {
        console.log(`[${OrchestratorAgent.AGENT_ID}] Received A2A message:`, message);
        switch (message.type) {
            case 'response-context':
                const config = vscode.workspace.getConfiguration('aiPartner');
                const apiKey = config.get<string>('llmApiKey') || '';
                const endpoint = config.get<string>('mcpServerUrl') || 'https://api.openai.com/v1/chat/completions'; // Defaulting to OpenAI for now

                const llmResponseText = await this.llmService.generateCompletion(this.lastUserQuery, message.payload, apiKey, endpoint);
                const llmResponse: ChatMessage = { author: 'agent', content: [{ type: 'text', text: llmResponseText }] };
                this.addMessageToHistory(llmResponse);
                this.postMessageToUI({ command: 'response', payload: llmResponse });
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
        // This method is now simplified as most logic flows through the context agent first.
        switch (message.command) {
            case 'analyzeActiveFile':
            case 'gitStatus':
            case 'runTerminalCommand':
                 this.dispatch({ sender: OrchestratorAgent.AGENT_ID, recipient: 'ContextManagementAgent', timestamp: new Date().toISOString(), type: 'request-context', payload: { query: this.getUserTextFromUIMessage(message), originalCommand: message } });
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
