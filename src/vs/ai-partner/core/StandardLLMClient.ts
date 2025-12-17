import { ILLMClient } from './ILLMClient';
import { LLMService, LlmMessage } from '../services/LLMService';
import { ConfigService } from '../config_service';

export class StandardLLMClient implements ILLMClient {
    constructor(
        private llmService: LLMService,
        private configService: ConfigService,
        private agentId: string
    ) {}

    async generateText(prompt: string, _options?: { temperature?: number }): Promise<string> {
        const model = this.configService.getModel(this.agentId);
        const apiKeys = await this.configService.getApiKeys();
        const endpoint = this.configService.getEndpoint();
        const provider = this.configService.getLlmProvider();
        const timeout = this.configService.getRequestTimeout(this.agentId);

        const messages: LlmMessage[] = [{ role: 'user', content: prompt }];

        const response = await this.llmService.requestLLMCompletion(
            provider,
            messages,
            apiKeys[0] || '', // Assuming first key
            endpoint,
            [], // tools
            model,
            undefined, // onChunk
            timeout
        );

        return response.choices?.[0]?.message?.content?.toString() || '';
    }
}
