/**
 * @file LLMService.ts
 * A service dedicated to handling communication with an OpenAI-compatible LLM,
 * including robust error handling and response streaming.
 */
export type LlmMessage = {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    pruningState?: 'pending' | 'keep' | 'prune';
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
};
export interface LlmFullResponse {
    choices: {
        message: LlmMessage;
    }[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}
/**
 * @class LLMService
 * @description A singleton service that manages all communication with a remote Large Language Model (LLM).
 * This service is responsible for sending prompts, handling API keys,
 * processing streamed responses, and managing connection and API errors.
 */
export declare class LLMService {
    private static instance;
    /**
     * Private constructor to prevent direct instantiation.
     */
    private constructor();
    /**
     * Gets the singleton instance of the service.
     */
    static getInstance(): LLMService;
    /**
     * Requests a completion from the LLM, with optional support for streaming.
     * @param {LlmMessage[]} conversationHistory - The sequence of messages representing the conversation so far.
     * @param {string} apiKey - The API key for authenticating with the LLM service.
     * @param {string} endpoint - The URL of the OpenAI-compatible API endpoint.
     * @param {any[]} tools - A list of tool definitions that the LLM can use.
     * @param {string} model - The identifier of the language model to use for the completion.
     * @param {(chunk: string) => void} [onChunk] - An optional callback to handle streaming response chunks. If provided, streaming is enabled.
     * @returns {Promise<LlmFullResponse>} A promise that resolves to the full response object from the LLM.
     */
    requestLLMCompletion(conversationHistory: LlmMessage[], apiKey: string, endpoint: string, tools: any[], model: string, onChunk?: (chunk: string) => void): Promise<LlmFullResponse>;
    /**
     * Processes a streamed response from the LLM API.
     * It reads the stream chunk by chunk, decodes it, and parses the server-sent events (SSE).
     * As content and tool calls are received, they are accumulated and the onChunk callback is fired for content.
     * @param {ReadableStream<Uint8Array>} stream - The response body stream from the fetch API.
     * @param {(chunk: string) => void} onChunk - The callback to execute for each piece of content received.
     * @returns {Promise<LlmFullResponse>} A promise that resolves to the fully assembled response once the stream is complete.
     * @private
     */
    private handleStreamedResponse;
}
