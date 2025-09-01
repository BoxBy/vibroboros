import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';
import { LLMService } from '../services/LLMService';
import { ConfigService } from '../config_service';

/**
 * An agent specialized in generating unit tests for a given code file.
 */
export class TestGenerationAgent {
    private static readonly AGENT_ID = 'TestGenerationAgent';

    constructor(
        private dispatch: (message: A2AMessage<any>) => Promise<void>,
        private llmService: LLMService,
        private configService: ConfigService // Inject ConfigService
    ) {}

    /**
     * Handles incoming messages from other agents.
     * @param message The agent-to-agent message.
     */
    public async handleA2AMessage(message: A2AMessage<any>): Promise<void> {
        if (message.type === 'request-test-generation') {
            await this.generateTests(message.payload.filePath, message.payload.query);
        }
    }

    /**
     * Generates tests for the specified file path based on a user query.
     * @param filePath The absolute path to the file to generate tests for.
     * @param userQuery The original user query that triggered the request.
     */
    private async generateTests(filePath: string, userQuery: string): Promise<void> {
        this._sendStatusBarUpdate('Generating unit tests...');

        try {
            const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            const code = new TextDecoder().decode(fileContent);

            const prompt = `You are an expert test engineer. Your task is to write unit tests for the following code, based on the user's request.\n\nFile Path: ${filePath}\nUser Request: "${userQuery}"\n\nCode:\n\`\`\`\n${code}\n\`\`\`\n\nPlease generate a comprehensive suite of unit tests using a popular testing framework appropriate for the language.\nRespond with only the generated test code inside a markdown code block. Add comments where necessary.\n`;

            const model = this.configService.getModel(TestGenerationAgent.AGENT_ID);
            const apiKeys = this.configService.getApiKeys();
            const endpoint = this.configService.getEndpoint();

            const llmResponse = await this.llmService.requestLLMCompletion(
                [{ role: 'user', content: prompt }],
                apiKeys[0] || '', // Use the first available key
                endpoint,
                [],
                model
            );

            const rawContent = llmResponse.choices[0]?.message?.content;

            await this.dispatch({
                sender: TestGenerationAgent.AGENT_ID,
                recipient: 'OrchestratorAgent',
                timestamp: new Date().toISOString(),
                type: 'response-test-generation',
                payload: { rawContent: rawContent || '// No tests were generated.' }
            });

        } catch (error: any) {
            console.error('[TestGenerationAgent] Error:', error);
            await this.dispatch({
                sender: TestGenerationAgent.AGENT_ID,
                recipient: 'OrchestratorAgent',
                timestamp: new Date().toISOString(),
                type: 'response-test-generation',
                payload: { rawContent: `Error generating tests: ${error.message}` }
            });
        }
    }

    private _sendStatusBarUpdate(text: string) {
        this.dispatch({
            sender: TestGenerationAgent.AGENT_ID,
            recipient: 'OrchestratorAgent',
            timestamp: new Date().toISOString(),
            type: 'statusUpdate',
            payload: { text }
        });
    }
}
