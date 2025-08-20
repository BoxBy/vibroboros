import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';
import { MCPServer } from '../server/MCPServer';
import { LLMService } from '../services/LLMService';

type ChatMessage = { author: 'user' | 'agent', content: any[] };
// For tracking the multi-turn conversation with the LLM, including tool usage.
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

    constructor(dispatch: (message: A2AMessage<any>) => void, mcpServer: MCPServer, state: vscode.Memento) {
        this.dispatch = dispatch;
        this.mcpServer = mcpServer;
        this.state = state;
        this.llmService = new LLMService();
        this.chatHistory = this.state.get<ChatMessage[]>(OrchestratorAgent.CHAT_HISTORY_KEY, []);
    }

    public registerWebviewPanel(panel: vscode.WebviewPanel | undefined): void {
        this.webviewPanel = panel;
        if (panel) {
            this.postMessageToUI({ command: 'loadHistory', payload: this.chatHistory });
        }
    }

    public handleUIMessage(message: any): void {
        if (message.command === 'loadSettings' || message.command === 'saveSettings') {
            this.handleSettingsCommands(message);
            return;
        }

        const userText = this.getUserTextFromUIMessage(message);
        const userMessage: ChatMessage = { author: 'user', content: [{ type: 'text', text: userText }] };
        this.addMessageToHistory(userMessage);

        // For any user query that might require tools, start a new LLM conversation.
        this.llmConversationHistory = [{ role: 'user', content: userText }];
        this.dispatch({ sender: OrchestratorAgent.AGENT_ID, recipient: 'ContextManagementAgent', timestamp: new Date().toISOString(), type: 'request-context', payload: { query: userText } });
    }

    public async handleA2AMessage(message: A2AMessage<any>): Promise<void> {
        if (message.type === 'response-context') {
            const systemPrompt = this.createSystemPrompt(message.payload);
            // Prepend the system prompt to the conversation history for the LLM.
            this.llmConversationHistory.unshift({ role: 'system', content: systemPrompt });
            await this.processLlmResponse(null);
        } else {
            // Handle other A2A messages if necessary in the future.
        }
    }

    private async processLlmResponse(llmMessage: LlmMessage | null): Promise<void> {
        if (llmMessage) {
            this.llmConversationHistory.push(llmMessage);
        }

        const config = vscode.workspace.getConfiguration('aiPartner');
        const apiKey = config.get<string>('llmApiKey') || '';
        const endpoint = config.get<string>('mcpServerUrl') || 'https://api.openai.com/v1/chat/completions';
        const toolSchemas = this.mcpServer.getToolSchemas();

        const responseMessage = await this.llmService.requestLLMCompletion(this.llmConversationHistory, apiKey, endpoint, toolSchemas);
        this.llmConversationHistory.push(responseMessage);

        if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
            const toolResults = await this.executeToolCalls(responseMessage.tool_calls);
            // Pass the tool results back to this function to continue the loop.
            await this.processLlmResponse({ role: 'tool', content: null, tool_calls: toolResults });
        } else if (responseMessage.content) {
            const finalResponse: ChatMessage = { author: 'agent', content: [{ type: 'text', text: responseMessage.content }] };
            this.addMessageToHistory(finalResponse);
            this.postMessageToUI({ command: 'response', payload: finalResponse });
        }
    }

    private async executeToolCalls(toolCalls: any[]): Promise<any[]> {
        const toolResponses = [];
        for (const toolCall of toolCalls) {
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments);
            const toolContent = await this.sendMCPRequest(toolName, toolArgs);
            const contentString = toolContent.map((c: any) => c.text).join('\n');

            toolResponses.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                name: toolName,
                content: contentString,
            });
        }
        return toolResponses;
    }

    private async sendMCPRequest(tool: string, params: Record<string, any>): Promise<any[]> {
        const request = { jsonrpc: '2.0', id: crypto.randomUUID(), method: 'tools/call', params: { name: tool, arguments: params } };
        const response = await this.mcpServer.handleRequest(request);
        return response.result?.content || [{ type: 'text', text: `Error: ${response.error?.message}` }];
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

    private createSystemPrompt(context: any): string {
        return `You are a helpful AI programming assistant integrated into VSCode. The user is asking a question about their project. Here is the context of their current workspace:\n- Active File: ${context.activeFilePath}\n- Language: ${context.language}\n- Open Files: ${context.openFiles.join(', ')}\n- Code Preview of Active File:\n---\n${context.contentPreview}\n---\nBased on this context, please answer the user's question or use one of the available tools to assist them.`;
    }

    private getUserTextFromUIMessage(message: any): string {
        return message.query || message.commandString || 'Perform Action';
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
