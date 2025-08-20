import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';
import { MCPServer } from '../server/MCPServer';

type ChatMessage = { author: 'user' | 'agent', text: string };

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

        const userMessage: ChatMessage = { author: 'user', text: message.command === 'analyzeActiveFile' ? 'Analyze the active file' : message.command === 'gitStatus' ? 'Get Git status' : message.query || message.commandString };
        this.addMessageToHistory(userMessage);

        switch (message.command) {
            case 'searchWeb':
                this.sendMCPRequest('WebSearchTool', { query: message.query });
                break;
            case 'analyzeActiveFile':
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    const filePath = activeEditor.document.uri.fsPath;
                    this.dispatch({
                        sender: OrchestratorAgent.AGENT_ID,
                        recipient: 'CodeAnalysisAgent',
                        timestamp: new Date().toISOString(),
                        type: 'request-code-analysis',
                        payload: { filePath }
                    });
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

    public handleA2AMessage(message: A2AMessage<any>): void {
        console.log(`[${OrchestratorAgent.AGENT_ID}] Received A2A message:`, message);

        switch (message.type) {
            case 'response-code-summary':
                this.dispatch({
                    sender: OrchestratorAgent.AGENT_ID,
                    recipient: 'DocumentationGenerationAgent',
                    timestamp: new Date().toISOString(),
                    type: 'request-documentation-generation',
                    payload: { codeSummary: message.payload }
                });
                break;

            case 'response-documentation-generation':
                const docResponse: ChatMessage = { author: 'agent', text: message.payload.documentation };
                this.addMessageToHistory(docResponse);
                this.postMessageToUI({ command: 'response', payload: docResponse });
                break;

            default:
                const defaultResponse: ChatMessage = { author: 'agent', text: JSON.stringify(message.payload) };
                this.addMessageToHistory(defaultResponse);
                this.postMessageToUI({ command: 'response', payload: defaultResponse });
                break;
        }
    }

    private async sendMCPRequest(tool: string, params: Record<string, any>): Promise<void> {
        const request = {
            jsonrpc: '2.0',
            id: crypto.randomUUID(),
            method: 'tools/call',
            params: { name: tool, arguments: params }
        };

        let response;
        try {
            response = await this.mcpServer.handleRequest(request);
        } catch (error: any) {
            console.error(`[${OrchestratorAgent.AGENT_ID}] MCP Request failed:`, error);
            response = { error: { message: error.message || 'Failed to execute tool.' } };
        }

        let agentResponseText = '';
        if (response.result && response.result.content) {
            agentResponseText = response.result.content.map((c: any) => c.text).join('\n');
        } else if (response.error) {
            agentResponseText = `Error: ${response.error.message}`;
        }

        const agentResponse: ChatMessage = { author: 'agent', text: agentResponseText };
        this.addMessageToHistory(agentResponse);
        this.postMessageToUI({ command: 'response', payload: agentResponse });
    }

    private sendErrorToUI(errorMessage: string): void {
        const errorResponse: ChatMessage = { author: 'agent', text: `Error: ${errorMessage}` };
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
