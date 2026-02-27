/**
 * Interface for LLM Service
 * Handles communication with Language Model providers
 */

export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'azure' | 'ollama' | 'xai' | 'groq' | 'openrouter' | 'zai' | 'custom';

export interface LlmMessageContent {
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
}

export interface LlmMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | LlmMessageContent[];
    tool_call_id?: string;
    name?: string;
    tool_calls?: any[];
}

export interface LlmFullResponse {
    content: string;
    choices?: Array<{
        message?: {
            content?: string;
            tool_calls?: any[];
        };
        text?: string;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    model?: string;
}

export interface ILLMService {
    /**
     * Send a chat completion request
     */
    chat(messages: LlmMessage[], options?: any): Promise<LlmFullResponse>;

    /**
     * Send a streaming chat completion request
     */
    chatStream(messages: LlmMessage[], options?: any): AsyncIterable<string>;

    /**
     * Request LLM completion with full parameters
     * Used by agent loop for tool-calling workflows
     */
    requestLLMCompletion(
        provider: LLMProvider,
        messages: LlmMessage[],
        apiKey: string,
        endpoint: string,
        tools: any[],
        model: string,
        onStreamingData?: (chunk: string) => void,
        timeout?: number
    ): Promise<LlmFullResponse>;

    /**
     * Count tokens for a given text
     */
    countTokens(text: string, model?: string): number;

    /**
     * Get current provider
     */
    getProvider(): LLMProvider;

    /**
     * Set provider
     */
    setProvider(provider: LLMProvider): void;

    /**
     * Get API keys
     */
    getApiKeys(): { [key: string]: string };

    /**
     * Get provider for an agent
     */
    getProviderForAgent(agentName: string): LLMProvider;

    /**
     * Get model for an agent
     */
    getModel(agentName: string): string;

    /**
     * Check if streaming is enabled
     */
    isStreamingEnabled(): boolean;

    /**
     * List available models for a provider
     */
    listModels(provider: LLMProvider, apiKey: string, endpoint?: string): Promise<string[]>;
}
