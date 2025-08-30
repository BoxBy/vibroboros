import { Agent } from "../agent";
import { A2AMessage } from "../interfaces/A2AMessage";
import { LLMService } from "../services/LLMService";
import { ConfigService } from '../config_service';

/**
 * Generates documentation for code, such as JSDoc comments or Markdown files.
 */
export class DocumentationGenerationAgent extends Agent {
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
            case 'generate_documentation':
                await this.handleGenerateDocumentation(message);
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
     * Handles the request to generate documentation for a piece of code.
     * @param message The incoming A2A message with the code to document.
     */
    private async handleGenerateDocumentation(message: A2AMessage<any>): Promise<void> {
        const code = message.payload.code;
        if (!code) {
            await this.sendErrorResponse(message, "'code' is required in the payload.");
            return;
        }

        const prompt = `Generate a concise JSDoc comment for the following TypeScript code. Code: ${code}`;

        try {
            const apiKeys = this.configService.getApiKeys();
            const endpoint = this.configService.getEndpoint();
            const model = this.configService.getModel('docGen');

            const llmResponse = await this.llmService.requestLLMCompletion(
                [{ role: 'user', content: prompt }],
                apiKeys[0], // Use the first available key
                endpoint,
                [],
                model
            );
            const documentation = llmResponse.content;

            await this.sendMessage({
                sender: this.name,
                recipient: message.sender,
                type: 'generate_documentation_response',
                payload: { documentation },
                timestamp: new Date().toISOString(),
                correlationId: message.correlationId
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await this.sendErrorResponse(message, `Failed to generate documentation: ${errorMessage}`);
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
