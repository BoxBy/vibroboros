import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';
import { MCPMessage } from '../interfaces/MCPMessage';
import { MCPServer } from '../server/MCPServer';
import { LLMService } from '../services/LLMService';
import { randomUUID } from 'crypto';
import { AILedLearningAgent } from './AILedLearningAgent';

/**
 * @class RefactoringSuggestionAgent
 * A specialized agent that handles refactoring workflows, now adapted with user preferences.
 */
export class RefactoringSuggestionAgent {
    private static readonly AGENT_ID = 'RefactoringSuggestionAgent';
    private dispatch: (message: A2AMessage<any>) => void;
    private mcpServer: MCPServer;
    private llmService: LLMService;
    private learningAgent: AILedLearningAgent; // Added for personalization

    constructor(
        dispatch: (message: A2AMessage<any>) => void,
        mcpServer: MCPServer,
        llmService: LLMService,
        learningAgent: AILedLearningAgent // Injected dependency
    ) {
        this.dispatch = dispatch;
        this.mcpServer = mcpServer;
        this.llmService = llmService;
        this.learningAgent = learningAgent;
    }

    public async handleA2AMessage(message: A2AMessage<{ filePath: string, query: string }>): Promise<void> {
        if (message.type !== 'request-refactoring-suggestions') {
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

            // Determine user preference for refactoring suggestions
            const userPreference = this.learningAgent.getPreference('refactoring');
            let personalizationInstruction = '';
            if (userPreference === 'negative') {
                personalizationInstruction = `**CRITICAL NOTE:** The user has frequently dismissed refactoring suggestions in the past. Only propose a change if it offers a significant, unambiguous improvement. If the code is already good, do not suggest any changes.`;
            }

            const systemPrompt = `You are an expert software engineer specializing in code refactoring and writing clean, efficient code.` +
                                 `\\n\\n**INSTRUCTIONS:**\\n` +
                                 `1. Analyze the user\\'s request and the provided code.\\n` +
                                 `2. Rewrite the entire code for the file, incorporating the requested improvements.\\n` +
                                 `3. **IMPORTANT:** Your response must contain ONLY the raw, refactored code. Do not include any explanations, markdown formatting (like \\\`\\\`\\\`typescript), or any other text outside of the code itself. The output will be directly written back to the file.\\n\\n` +
                                 `${personalizationInstruction}`;

            const userPrompt = `The user wants to refactor this file: ${message.payload.filePath}.\\nTheir request is: \\\"${message.payload.query}\\\"\\n\\nHere is the original code:\\n\\\`\\\`\\\`\\n${fileContent}\\n\\\`\\\`\\\``;

            const config = vscode.workspace.getConfiguration('vibroboros');
            const apiKey = config.get<string>('llm.apiKeys')?.[0] || '';
            const endpoint = config.get<string>('llm.endpoint') || 'https://api.openai.com/v1/chat/completions';
            const model = config.get<string>('agent.refactoring.model') || 'gpt-4';

            const llmResponse = await this.llmService.requestLLMCompletion(
                [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                apiKey,
                endpoint,
                [],
                model
            );

            const refactoredCode = llmResponse.content;

            // Do not bother the user if the AI decided not to make a change.
            if (!refactoredCode || refactoredCode.trim() === fileContent.trim()) {
                console.log(`[${RefactoringSuggestionAgent.AGENT_ID}] No significant refactoring suggested based on user preference and code analysis.`);
                return;
            }

            const responsePayload = {
                content: [
                    { type: 'text', text: `Based on your request, here is a suggested refactoring for ${message.payload.filePath}:` },
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
