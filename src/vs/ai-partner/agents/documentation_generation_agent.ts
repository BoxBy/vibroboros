import { Agent } from "../agent";
import { A2AMessage } from "../core_data_structures";
import { LlmService } from "../llm_service";

/**
 * Generates documentation for code, such as JSDoc comments or Markdown files.
 */
export class DocumentationGenerationAgent extends Agent {
    public async handleMessage(message: A2AMessage): Promise<void> {
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
                    timestamp: Date.now(),
                    correlationId: message.correlationId
                });
                break;
        }
    }

    /**
     * Handles the request to generate documentation for a piece of code.
     * @param message The incoming A2A message with the code to document.
     */
    private async handleGenerateDocumentation(message: A2AMessage): Promise<void> {
        const code = message.payload.code;
        if (!code) {
            await this.sendErrorResponse(message, "'code' is required in the payload.");
            return;
        }

        const prompt = `Generate a concise JSDoc comment for the following TypeScript code. Only return the comment, without any extra text or code fences.\n\nCode:\n\`\`\`typescript\n${code}\n\`\`\``;

        try {
            const llmService = LlmService.getInstance();
            const documentation = await llmService.getCompletion(prompt);

            await this.sendMessage({
                sender: this.name,
                recipient: message.sender,
                type: 'generate_documentation_response',
                payload: { documentation },
                timestamp: Date.now(),
                correlationId: message.correlationId
            });
        } catch (error) {
            await this.sendErrorResponse(message, `Failed to generate documentation: ${error}`);
        }
    }

    private async sendErrorResponse(originalMessage: A2AMessage, errorMessage: string): Promise<void> {
        console.error(`[${this.name}] ${errorMessage}`);
        await this.sendMessage({
            sender: this.name,
            recipient: originalMessage.sender,
            type: 'error',
            payload: { error: errorMessage, originalType: originalMessage.type },
            timestamp: Date.now(),
            correlationId: originalMessage.correlationId
        });
    }
}
*/