import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';
import { MCPServer } from '../server/MCPServer';
import { LLMService } from '../services/LLMService';
import { randomUUID } from 'crypto';

/**
 * @class DocumentationGenerationAgent
 * A specialized agent for generating documentation for code.
 */
export class DocumentationGenerationAgent {
    private static readonly AGENT_ID = 'DocumentationGenerationAgent';
    private dispatch: (message: A2AMessage<any>) => void;
    private mcpServer: MCPServer;
    private llmService: LLMService;

    constructor(dispatch: (message: A2AMessage<any>) => void, mcpServer: MCPServer, llmService: LLMService) {
        this.dispatch = dispatch;
        this.mcpServer = mcpServer;
        this.llmService = llmService;
    }

    public async handleA2AMessage(message: A2AMessage<{ filePath: string, query: string }>): Promise<void> {
        if (message.type !== 'request-documentation-generation') {
            return;
        }

        try {
            const fileContentResponse = await this.mcpServer.handleRequest({
                jsonrpc: '2.0', id: '1', method: 'tools/call',
                params: { name: 'FileReadTool', arguments: { filePath: message.payload.filePath } }
            });
            const fileContent = fileContentResponse.result.content[0].text;

            const systemPrompt = `You are an expert technical writer, skilled at creating easy-to-understand documentation for complex code.\n\n` +
                                 `**INSTRUCTIONS:**\n` +
                                 `1. Analyze the user's request and the provided code.\n` +
                                 `2. Generate clear and concise documentation for the code.\n` +
                                 `3. The documentation should be in Markdown format.\n` +
                                 `4. Explain the code's overall purpose, its main functions or classes, and any important parameters or return values.`;

            const userPrompt = `The user wants to document this file: ${message.payload.filePath}.\nTheir request is: \"${message.payload.query}\"\n\nHere is the code to document:\n\`\`\`\n${fileContent}\n\`\`\``;

            const config = vscode.workspace.getConfiguration('aiPartner');
            const apiKey = config.get<string>('llmApiKey') || '';
            const endpoint = config.get<string>('mcpServerUrl') || 'https://api.openai.com/v1/chat/completions';

            const llmResponse = await this.llmService.requestLLMCompletion(
                [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                apiKey,
                endpoint,
                []
            );

            const generatedDocs = llmResponse.content;

            const responsePayload = {
                content: [
                    { type: 'text', text: `Here is the suggested documentation for ${message.payload.filePath}:\n\n---\n${generatedDocs}` },
                    {
                        type: 'ui-action',
                        action: {
                            label: 'Save to new file (e.g., DOCS.md)',
                            toolName: 'FileWriteTool',
                            arguments: {
                                filePath: 'DOCS.md',
                                content: generatedDocs
                            },
                            suggestionId: randomUUID(),
                            suggestionType: 'documentation'
                        }
                    }
                ]
            };

            this.dispatch({
                sender: DocumentationGenerationAgent.AGENT_ID,
                recipient: 'OrchestratorAgent',
                timestamp: new Date().toISOString(),
                type: 'response-documentation-generation',
                payload: responsePayload
            });

        } catch (error: any) {
            console.error(`[${DocumentationGenerationAgent.AGENT_ID}] Error during documentation generation:`, error);
            this.dispatch({
                sender: DocumentationGenerationAgent.AGENT_ID,
                recipient: 'OrchestratorAgent',
                timestamp: new Date().toISOString(),
                type: 'response-documentation-generation',
                payload: { content: [{ type: 'text', text: `An error occurred while generating documentation: ${error.message}` }] }
            });
        }
    }
}
