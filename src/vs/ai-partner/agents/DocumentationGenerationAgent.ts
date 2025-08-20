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

        console.log(`[${DocumentationGenerationAgent.AGENT_ID}] Received documentation request for:`, message.payload.filePath);

        try {
            const fileContentResponse = await this.mcpServer.handleRequest({
                jsonrpc: '2.0', id: '1', method: 'tools/call',
                params: { name: 'FileReadTool', arguments: { filePath: message.payload.filePath } }
            });
            const fileContent = fileContentResponse.result.content[0].text;

            const docPrompt = `The user wants to document this file: ${message.payload.filePath}.\nTheir request is: \"${message.payload.query}\"\n\nPlease provide clear and concise documentation for the code in Markdown format.`;
            const systemPrompt = "You are an expert technical writer, skilled at creating easy-to-understand documentation for complex code.";

            const config = vscode.workspace.getConfiguration('aiPartner');
            const apiKey = config.get<string>('llmApiKey') || '';
            const endpoint = config.get<string>('mcpServerUrl') || 'https://api.openai.com/v1/chat/completions';

            const llmResponse = await this.llmService.requestLLMCompletion(
                [{ role: 'system', content: systemPrompt }, { role: 'user', content: `${docPrompt}\n\n${fileContent}` }],
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
                            // Add metadata for the learning agent
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
