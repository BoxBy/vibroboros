import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';
import { MCPServer } from '../server/MCPServer';
import { LLMService } from '../services/LLMService';
import { randomUUID } from 'crypto';

/**
 * @class RefactoringSuggestionAgent
 * A specialized agent that handles refactoring workflows.
 */
export class RefactoringSuggestionAgent {
    private static readonly AGENT_ID = 'RefactoringSuggestionAgent';
    private dispatch: (message: A2AMessage<any>) => void;
    private mcpServer: MCPServer;
    private llmService: LLMService;

    constructor(dispatch: (message: A2AMessage<any>) => void, mcpServer: MCPServer, llmService: LLMService) {
        this.dispatch = dispatch;
        this.mcpServer = mcpServer;
        this.llmService = llmService;
    }

    public async handleA2AMessage(message: A2AMessage<{ filePath: string, query: string }>): Promise<void> {
        if (message.type !== 'request-refactoring-suggestions') {
            return;
        }

        try {
            const fileContentResponse = await this.mcpServer.handleRequest({
                jsonrpc: '2.0', id: '1', method: 'tools/call',
                params: { name: 'FileReadTool', arguments: { filePath: message.payload.filePath } }
            });
            const fileContent = fileContentResponse.result.content[0].text;

            const systemPrompt = `You are an expert software engineer specializing in code refactoring and writing clean, efficient code.\n\n` +
                                 `**INSTRUCTIONS:**\n` +
                                 `1. Analyze the user's request and the provided code.\n` +
                                 `2. Rewrite the entire code for the file, incorporating the requested improvements.\n` +
                                 `3. **IMPORTANT:** Your response must contain ONLY the raw, refactored code. Do not include any explanations, markdown formatting (like \`\`\`typescript), or any other text outside of the code itself. The output will be directly written back to the file.`;

            const userPrompt = `The user wants to refactor this file: ${message.payload.filePath}.\nTheir request is: \"${message.payload.query}\"\n\nHere is the original code:\n\`\`\`\n${fileContent}\n\`\`\``;

            const config = vscode.workspace.getConfiguration('aiPartner');
            const apiKey = config.get<string>('llmApiKey') || '';
            const endpoint = config.get<string>('mcpServerUrl') || 'https://api.openai.com/v1/chat/completions';

            const llmResponse = await this.llmService.requestLLMCompletion(
                [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                apiKey,
                endpoint,
                []
            );

            const refactoredCode = llmResponse.content;

            const responsePayload = {
                content: [
                    { type: 'text', text: `Here is the suggested refactoring for ${message.payload.filePath}:\n\n\`\`\`\n${refactoredCode}\n\`\`\`` },
                    {
                        type: 'ui-action',
                        action: {
                            label: 'Apply Refactoring',
                            toolName: 'FileWriteTool',
                            arguments: {
                                filePath: message.payload.filePath,
                                content: refactoredCode
                            },
                            suggestionId: randomUUID(),
                            suggestionType: 'refactoring'
                        }
                    }
                ]
            };

            this.dispatch({
                sender: RefactoringSuggestionAgent.AGENT_ID,
                recipient: 'OrchestratorAgent',
                timestamp: new Date().toISOString(),
                type: 'response-refactoring-suggestions',
                payload: responsePayload
            });

        } catch (error: any) {
            console.error(`[${RefactoringSuggestionAgent.AGENT_ID}] Error during refactoring:`, error);
            this.dispatch({
                sender: RefactoringSuggestionAgent.AGENT_ID,
                recipient: 'OrchestratorAgent',
                timestamp: new Date().toISOString(),
                type: 'response-refactoring-suggestions',
                payload: { content: [{ type: 'text', text: `An error occurred while refactoring: ${error.message}` }] }
            });
        }
    }
}
