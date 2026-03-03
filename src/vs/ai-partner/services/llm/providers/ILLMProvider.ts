import { LlmMessage, LlmFullResponse } from '../../LLMService';

export interface ILLMProvider {
    completion(
        history: LlmMessage[],
        options: {
            model: string;
            apiKey?: string;
            endpoint?: string;
            temperature?: number;
            maxTokens?: number;
            structured?: any;
            tools?: any[];
        },
        onChunk?: (chunk: string) => void
    ): Promise<LlmFullResponse>;
}
