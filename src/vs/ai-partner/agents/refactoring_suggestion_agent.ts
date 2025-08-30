import { Agent } from "../agent";
import { A2AMessage } from "../interfaces/A2AMessage";
import { LLMService } from "../services/LLMService";
import { ConfigService } from '../config_service';

/**
 * Identifies opportunities for code refactoring and provides suggestions.
 */
export class RefactoringSuggestionAgent extends Agent {
    private llmService: LLMService;
    private configService: ConfigService;

    constructor(name: string, messageSender: (message: A2AMessage<any>) => Promise<void>) {
        super(name, messageSender);
        this.llmService = new LLMService();
        this.configService = ConfigService.getInstance();
    }

    public async handleMessage(message: A2AMessage<any>): Promise<void> {
        console.log(`[${this.name}] received message of type "${message.type}" from [${message.sender}].`);

        switch (message.type) {
            case 'get_refactoring_suggestions':
                await this.handleGetRefactoringSuggestions(message);
                break;

            default:
                await this.sendMessage({
                    sender: this.name,
                    recipient: message.sender,
                    type: 'response',
                    payload: { status: 'Acknowledged', originalType: message.type },
                    timestamp: new Date().toISOString(),
                    correlationId: message.correlationId
                });
                break;
        }
    }

    /**
     * Handles the request to generate refactoring suggestions for a piece of code.
     * @param message The incoming A2A message with the code to refactor.
     */
    private async handleGetRefactoringSuggestions(message: A2AMessage<any>): Promise<void> {
        const code = message.payload.code;
        if (!code) {
            await this.sendErrorResponse(message, "'code' is required in the payload.");
            return;
        }

        const prompt = `Analyze the following TypeScript code and provide suggestions for refactoring. Focus on improving readability, performance, and adherence to best practices. Return the suggestions as a list in a Markdown format.\n\nCode:\n\`\`\`typescript\n${code}\n\`\`\``;

        try {
            const apiKeys = this.configService.getApiKeys();
            const endpoint = this.configService.getEndpoint();
            const model = this.configService.getModel('refactoring');

            const llmResponse = await this.llmService.requestLLMCompletion(
                [{ role: 'user', content: prompt }],
                apiKeys[0],
                endpoint,
                [],
                model
            );
            const suggestions = llmResponse.content;

            await this.sendMessage({
                sender: this.name,
                recipient: message.sender,
                type: 'get_refactoring_suggestions_response',
                payload: { suggestions },
                timestamp: new Date().toISOString(),
                correlationId: message.correlationId
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await this.sendErrorResponse(message, `Failed to get refactoring suggestions: ${errorMessage}`);
        }
    }

    private async sendErrorResponse(originalMessage: A2AMessage<any>, errorMessage: string): Promise<void> {
        console.error(`[${this.name}] ${errorMessage}`);
        await this.sendMessage({
            sender: this.name,
            recipient: originalMessage.sender,
            type: 'error',
            payload: { error: errorMessage, originalType: originalMessage.type },
            timestamp: new Date().toISOString(),
            correlationId: originalMessage.correlationId
        });
    }
}
