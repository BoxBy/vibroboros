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
    private webviewPanel: vscode.WebviewPanel | undefined;
    private state: vscode.Memento;
    private chatHistory: ChatMessage[] = [];
    private llmService: LLMService;
    private llmConversationHistory: LlmMessage[] = [];

    constructor(dispatch: (message: A2AMessage<any>) => void, mcpServer: MCPServer, llmService: LLMService, state: vscode.Memento) {
        this.dispatch = dispatch;
        this.mcpServer = mcpServer;
        this.llmService = llmService;
        this.state = state;
        this.chatHistory = this.state.get<ChatMessage[]>(OrchestratorAgent.CHAT_HISTORY_KEY, []);
    }

    public registerWebviewPanel(panel: vscode.WebviewPanel | undefined): void {
        this.webviewPanel = panel;
        if (panel) {
            this.postMessageToUI({ command: 'loadHistory', payload: this.chatHistory });
        }
    }

    public handleUIMessage(message: any): void {
        if (message.command.includes('Settings') || message.command.includes('FileProtection') || message.command === 'executeTool') {
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
        if (message.type === 'response-context') {
            const systemPrompt = this.createSystemPrompt(message.payload);
            this.llmConversationHistory.unshift({ role: 'system', content: systemPrompt });
            await this.processLlmResponse(null);
        } else if (message.type === 'response-refactoring-suggestions' || message.type === 'response-documentation-generation') {
            const response: ChatMessage = { author: 'agent', content: message.payload.content };
            this.addMessageToHistory(response);
            this.postMessageToUI({ command: 'response', payload: response });
        } else if (message.type === 'response-security-analysis') {
            // This is a proactive finding, so we don't add it to the main chat.
            // We send a special command to the UI to display it in the diagnostics panel.
            this.postMessageToUI({
                command: 'add-diagnostic',
                payload: {
                    source: 'Security Analysis',
                    filePath: message.payload.filePath,
                    issues: message.payload.issues
                }
            });
        }
    }

    private async processLlmResponse(llmMessage: LlmMessage | null): Promise<void> {
        // ... (implementation remains the same)
    }

    private async executeToolCalls(toolCalls: any[]): Promise<any[]> {
        // ... (implementation remains the same)
    }

    private async sendMCPRequest(tool: string, params: Record<string, any>): Promise<any[]> {
        const request = { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'tools/call', params: { name: tool, arguments: params } };
        const response = await this.mcpServer.handleRequest(request);
        return response.result?.content || [{ type: 'text', text: `Error: ${response.error?.message}` }];
    }

    private handleSystemCommands(message: any): void {
        // ... (implementation remains the same)
    }

    private createSystemPrompt(context: any): string {
        return `You are an expert AI programming assistant...`; // Prompt truncated for brevity
    }

    private getUserTextFromUIMessage(message: any): string {
        return message.query || message.commandString || 'Perform Action';
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
