import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';
import { MCPMessage } from '../interfaces/MCPMessage';
import { MCPServer } from '../server/MCPServer';
import { LLMService } from '../services/LLMService';
import { randomUUID } from 'crypto';

/**
 * @class CommentGenerationAgent
 * A specialized agent for generating inline comments for code.
 */
export class CommentGenerationAgent {
    private static readonly AGENT_ID = 'CommentGenerationAgent';
    private dispatch: (message: A2AMessage<any>) => void;
    private mcpServer: MCPServer;
    private llmService: LLMService;

    constructor(dispatch: (message: A2AMessage<any>) => void, mcpServer: MCPServer, llmService: LLMService) {
        this.dispatch = dispatch;
        this.mcpServer = mcpServer;
        this.llmService = llmService;
    }

    public async handleA2AMessage(message: A2AMessage<{ filePath: string, query: string }>): Promise<void> {
        if (message.type !== 'request-comment-generation') {
            return;
        }

        try {
            const fileReadRequest: MCPMessage<any> = {
                jsonrpc: '2.0',
                id: '1',
                method: 'tools/call',
                params: { name: 'FileReadTool', arguments: { filePath: message.payload.filePath } }
            };
            const fileContentResponse = await this.mcpServer.handleRequest(fileReadRequest);
            const fileContent = fileContentResponse.result.content[0].text;

            const systemPrompt = `You are an expert programmer tasked with writing high-quality code comments.\n\n` +
                                 `**INSTRUCTIONS:**\n` +
                                 `1. Analyze the provided code.\n` +
                                 `2. Add concise, helpful JSDoc-style comments to all functions, classes, and complex logic blocks.\n` +
                                 `3. **IMPORTANT**: You MUST return the complete, fully-modified code for the entire file. Do NOT use markdown or any other formatting. Output only the raw code.`;

            const userPrompt = `Add comments to the following code:\n\n${fileContent}`;

            const config = vscode.workspace.getConfiguration('vibroboros');
            const apiKey = config.get<string>('llm.apiKeys')?.[0] || '';
            const endpoint = config.get<string>('llm.endpoint') || 'https://api.openai.com/v1/chat/completions';
            const model = config.get<string>('agent.commentGen.model') || 'gpt-4'; // Using a different model config key

            const llmResponse = await this.llmService.requestLLMCompletion(
                [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                apiKey,
                endpoint,
                [],
                model
            );

            const commentedCode = llmResponse.choices[0]?.message?.content;

            if (!commentedCode) {
                throw new Error('LLM failed to generate comments.');
            }

            const responsePayload = {
                rawContent: commentedCode, // Send the raw code back
                content: [
                    { type: 'text', text: `I have added comments to ${message.payload.filePath}.` },
                    {
                        type: 'ui-action',
                        action: {
                            label: 'Overwrite original file',
                            toolName: 'FileWriteTool',
                            arguments: {
                                filePath: message.payload.filePath,
                                content: commentedCode
                            },
                            suggestionId: randomUUID(),
                            suggestionType: 'commenting'
                        }
                    }
                ]
            };

            this.dispatch({
                sender: CommentGenerationAgent.AGENT_ID,
                recipient: 'OrchestratorAgent',
                timestamp: new Date().toISOString(),
                type: 'response-comment-generation',
                payload: responsePayload
            });

        } catch (error: any) {
            console.error(`[${CommentGenerationAgent.AGENT_ID}] Error during comment generation:`, error);
            this.dispatch({
                sender: CommentGenerationAgent.AGENT_ID,
                recipient: 'OrchestratorAgent',
                timestamp: new Date().toISOString(),
                type: 'response-comment-generation',
                payload: { content: [{ type: 'text', text: `An error occurred while generating comments: ${error.message}` }] }
            });
        }
    }
}
