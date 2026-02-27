import type { IConfigService } from '../di/interfaces/IConfigService';

export type LlmMessage = {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    pruningState?: 'pending' | 'keep' | 'prune';
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
};

export interface LlmFullResponse {
    choices: { message: LlmMessage }[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export type LLMProvider = 'openai' | 'ollama' | 'anthropic' | 'xai' | 'google' | 'groq' | 'openrouter' | 'zai';

/**
 * @class LLMService
 * @description A service that manages all communication with a remote Large Language Model (LLM).
 * This service is responsible for sending prompts, handling API keys,
 * processing streamed responses, and managing connection and API errors.
 * Now uses dependency injection instead of singleton pattern.
 */
export class LLMService {
    private static instance: LLMService;
    private configService: IConfigService;

    /**
     * Constructor with dependency injection support.
     * @param configService - Optional ConfigService instance for DI
     */
    private constructor(configService?: IConfigService) {
        this.configService = configService as any;
    }

    /**
     * Gets the singleton instance of the service.
     * @param configService - Optional ConfigService instance for DI
     * @deprecated Use dependency injection instead
     */
    public static getInstance(configService?: IConfigService): LLMService {
        if (!LLMService.instance) {
            LLMService.instance = new LLMService(configService);
        }
        return LLMService.instance;
    }

    /**
     * Sets the ConfigService instance for DI.
     * @internal
     */
    public setConfigService(configService: IConfigService): void {
        this.configService = configService;
    }

    /**
     * Counts tokens for a given text or messages.
     * Uses TokenizerService for accurate counting.
     */
    public countTokens(text: string, model?: string): number {
        const { TokenizerService } = require('./llm/TokenizerService');
        return TokenizerService.getInstance().countTokens(text, model || 'gpt-4o');
    }

    /**
     * Requests a completion from the LLM, with optional support for streaming.
     * @param {LLMProvider} provider - The LLM provider to use (e.g., 'openai', 'ollama').
     * @param {LlmMessage[]} conversationHistory - The sequence of messages representing the conversation so far.
     * @param {string} apiKey - The API key for authenticating with the LLM service.
     * @param {string} endpoint - The URL of the LLM API endpoint.
     * @param {any[]} tools - A list of tool definitions that the LLM can use.
     * @param {string} model - The identifier of the language model to use for the completion.
     * @param {(chunk: string) => void} [onChunk] - An optional callback to handle streaming response chunks. If provided, streaming is enabled.
     * @returns {Promise<LlmFullResponse>} A promise that resolves to the full response object from the LLM.
     */
    public async requestLLMCompletion(
	        provider: LLMProvider,
	        conversationHistory: LlmMessage[],
	        apiKey: string,
	        endpoint: string,
	        tools: any[],
	        model: string,
	        onChunk?: (chunk: string) => void
	    ): Promise<LlmFullResponse> {

            console.log('[LLMService] Request details:', {
                provider,
                endpoint,
                apiKeyPresent: !!apiKey,
                apiKeyLength: apiKey ? apiKey.length : 0,
                model
            });

	        // API 키가 필요한지 체크합니다
	        const isLocalOllama = provider === 'ollama' && endpoint.includes('localhost');
	        const needsApiKey = !isLocalOllama && provider !== 'google';

	        if (needsApiKey && !apiKey) {
	            throw new Error("LLM API key is not configured. Please go to Settings to add your API key.");
	        }	        let requestBody: any = {};
	        let headers: HeadersInit = {
	            'Content-Type': 'application/json',
	        };
	        let requestEndpoint = endpoint;

	        switch (provider) {
	            case 'openai':
	            case 'groq': // Groq uses OpenAI-compatible API
	            case 'openrouter': // OpenRouter uses OpenAI-compatible API
	                requestBody = {
	                    model: model,
	                    messages: conversationHistory,
	                    tools: tools,
	                    tool_choice: "auto",
	                    stream: !!onChunk,
	                };
	                if (apiKey) {
	                    headers['Authorization'] = `Bearer ${apiKey}`;
	                }
	                break;
            case 'ollama':
                requestBody = {
                    model: model,
                    messages: conversationHistory,
                    stream: !!onChunk,
                };

                // Debug: log detailed Ollama request setup
                console.log('[LLMService] Ollama debug - Initial API key:', apiKey ? 'provided' : 'not provided');

                if (apiKey) { // Ollama can have an optional API key (Bearer token)
                    console.log('[LLMService] Ollama debug - Setting Authorization header');
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }

                // Ollama Cloud uses /api/chat endpoint
                requestEndpoint = `${endpoint.endsWith('/api/chat') ? endpoint : `${endpoint}/api/chat`}`;
                console.log('[LLMService] Ollama debug - Request endpoint:', requestEndpoint);

                // Debug: log the computed endpoint and whether an API key is present (mask key for safety)
                try {
                    const maskedKey = apiKey && apiKey.length > 8 ? `Bearer ${apiKey.slice(0,4)}...${apiKey.slice(-4)}` : (apiKey ? 'Bearer ****' : '(none)');
                    console.log('[LLMService] Ollama debug - Request details:', {
                        computedEndpoint: requestEndpoint,
                        apiKeyPresent: !!apiKey,
                        maskedApiKey: maskedKey,
                        headers: Object.keys(headers)
                    });
                } catch (e) {
                    console.error('[LLMService] Ollama debug - Error masking key:', e);
                }
                // If using Ollama cloud and no API key is provided, return an error
                if (requestEndpoint.includes('ollama.com') && (!apiKey || apiKey.trim() === '')) {
                    const errorMessage = `Ollama Cloud requires a valid API key. Please set your Ollama API key in the extension settings.`;
                    console.error('[LLMService] Ollama cloud call prevented - missing API key.');
                    return { choices: [{ message: { role: 'assistant', content: errorMessage } }] };
                }
                // Log full request details for debugging
                console.log('[LLMService] Ollama request details:', {
                    endpoint: requestEndpoint,
                    headers,
                    body: requestBody
                });
                break;
	            case 'anthropic':
	                requestBody = {
	                    model: model,
	                    messages: conversationHistory.map(msg => ({
	                        role: msg.role === 'system' ? 'user' : msg.role, // Anthropic doesn't have a 'system' role in messages
	                        content: msg.content
	                    })),
	                    max_tokens: 4096, // Anthropic requires max_tokens
	                    stream: !!onChunk,
	                };
	                if (apiKey) {
	                    headers['x-api-key'] = apiKey;
	                    headers['anthropic-version'] = '2023-06-01'; // Required for Anthropic
	                }
	                requestEndpoint = `${endpoint.endsWith('/messages') ? endpoint : `${endpoint}/messages`}`;
	                break;
	            case 'xai': // Assuming xAI uses an OpenAI-compatible API for now
	                requestBody = {
	                    model: model,
	                    messages: conversationHistory,
	                    tools: tools,
	                    tool_choice: "auto",
	                    stream: !!onChunk,
	                };
	                if (apiKey) {
	                    headers['Authorization'] = `Bearer ${apiKey}`;
	                }
	                break;
	            case 'google':
	                requestBody = {
	                    contents: conversationHistory.map(msg => ({
	                        role: msg.role === 'assistant' ? 'model' : msg.role, // Google uses 'model' for assistant
	                        parts: [{ text: msg.content }]
	                    })),
	                    tools: tools,
	                };
	                requestEndpoint = `${endpoint.endsWith('/generateContent') ? endpoint : `${endpoint}/models/${model}:generateContent`}?key=${apiKey}`;
	                break;
            case 'zai': // Z.ai uses OpenAI-compatible API
                // Use endpoint as-is (no Coding Plan endpoint replacement)
                console.log('[LLMService] ZAI Debug - endpoint:', endpoint);

                requestBody = {
                    model: model,
                    messages: conversationHistory,
                    tools: tools,
                    tool_choice: "auto",
                    stream: !!onChunk,
                };
                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }
                requestEndpoint = `${endpoint}/chat/completions`;
                break;
	            default:
	                throw new Error(`Unsupported LLM provider: ${provider}`);
	        }

	        try {
	            console.log(`[LLMService] Attempting to fetch. Provider: ${provider}, Endpoint: ${requestEndpoint}`);
	            console.log(`[LLMService] Request body: ${JSON.stringify(requestBody, null, 2)}`);
	            const fetchPromise = fetch(requestEndpoint, {
	                method: 'POST',
	                headers: headers,
	                body: JSON.stringify(requestBody)
	            });

	            const timeoutPromise = new Promise((_, reject) => {
	                setTimeout(() => reject(new Error('Request timed out after 30 seconds')), 30000);
	            });

	            const response = await Promise.race([
	                fetchPromise,
	                timeoutPromise
	            ]) as Response;

	            if (!response.ok) {
	                let errorMessage = `API Error: The server responded with a status of ${response.status}.`;
	                const errorData = await response.json().catch(() => null);
	                if (errorData && errorData.error) {
	                    errorMessage += ` Details: ${errorData.error.message || JSON.stringify(errorData.error)}`;
	                } else if (response.status === 401) {
	                    errorMessage += ` Please check your API key.`;
	                } else if (response.status === 404) {
	                    errorMessage += ` Endpoint not found. Please check the URL.`;
	                }
	                console.error('[LLMService] API Error:', errorMessage, errorData);
	                return { choices: [{ message: { role: 'assistant', content: errorMessage } }] };
	            }

	            // Handle streaming response
	            if (onChunk && requestBody.stream && response.body) {
	                return this.handleStreamedResponse(response.body, onChunk);
	            } else {
	                // Handle non-streaming response
	                const data = await response.json();
	                if (provider === 'google') {
	                    // Google's response format is different
	                    const googleContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
	                    return { choices: [{ message: { role: 'assistant', content: googleContent } }] };
	                }
	                if (provider === 'ollama') {
	                    if (!data.message || !data.message.content) {
	                        const errorMessage = 'Ollama LLM did not return a valid message. The response might be empty or malformed.';
	                        console.error('[LLMService] Empty or malformed Ollama response:', data);
	                        return { choices: [{ message: { role: 'assistant', content: errorMessage } }] };
	                    }
	                    // Ollama returns a top-level message object
	                    return { choices: [{ message: data.message }] };
	                } else if (!data.choices || data.choices.length === 0) {
	                    const errorMessage = 'LLM did not return any choices. The response might be empty or malformed.';
	                    console.error('[LLMService] Empty or malformed response:', data);
	                    return { choices: [{ message: { role: 'assistant', content: errorMessage } }] };
	                }
	                return data;
	            }

	        } catch (error: any) {
	            let detailedErrorMessage = `**Connection Error:** Could not connect to the LLM service at ${requestEndpoint}.`;

	            if (error.message.includes('Request timed out')) {
	                detailedErrorMessage = `**Connection Error:** Request to LLM service at ${requestEndpoint} timed out after 30 seconds. This might indicate a slow server or network issue.`;
	            } else if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
	                detailedErrorMessage = `**Network Error:** Could not reach the LLM service at ${requestEndpoint}. Please check your internet connection, firewall settings, or if the LLM service is running and accessible. Original error: ${error.message}`;
	            } else {
	                detailedErrorMessage = `**Unexpected Connection Error:** An unexpected error occurred while trying to connect to the LLM service at ${requestEndpoint}. Please check the endpoint and your network. Original error: ${error.message}`;
	            }
	            console.error('[LLMService] LLM request failed:', error);
	            return { choices: [{ message: { role: 'assistant', content: detailedErrorMessage } }] };
	        }
	    }
    /**
     * Lists available models for a given LLM provider.
     * @param {LLMProvider} provider - The LLM provider to query.
     * @param {string} apiKey - The API key for authentication.
     * @param {string} endpoint - The base URL for the LLM service (e.g., for OpenAI, it might be https://api.openai.com/v1).
     * @returns {Promise<string[]>} A promise that resolves to an array of model names.
     */
    public async listModels(provider: LLMProvider, apiKey: string, endpoint: string): Promise<string[]> {
        let models: string[] = [];
        let url = '';
        const headers: HeadersInit = {};

        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        switch (provider) {
            case 'openai':
                url = 'https://api.openai.com/v1/models';
                headers['Authorization'] = `Bearer ${apiKey}`;
                break;
            case 'groq':
                url = 'https://api.groq.com/v1/models';
                headers['Authorization'] = `Bearer ${apiKey}`;
                break;
            case 'openrouter':
                url = 'https://openrouter.ai/api/v1/models';
                headers['Authorization'] = `Bearer ${apiKey}`;
                break;
            case 'ollama':
                const ollamaBaseEndpoint = endpoint.endsWith('/api/chat') ? endpoint.replace('/api/chat', '') : endpoint;
                url = `${ollamaBaseEndpoint}/api/tags`;
                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }
                break;
            case 'anthropic':
                url = 'https://api.anthropic.com/v1/models';
                headers['x-api-key'] = apiKey;
                headers['anthropic-version'] = '2023-06-01';
                break;
            case 'xai': // Assuming xAI uses an OpenAI-compatible API for now
                url = `${endpoint.replace(/\/(v1\/)?chat\/completions$/, '')}/models`;
                break;
            case 'google':
                url = `${endpoint.replace(/generateContent$/, '')}/models?key=${apiKey}`;
                break;
            case 'zai': // Z.ai uses OpenAI-compatible API
                // Check if Coding Plan is enabled to use correct endpoint
                const isCodingPlan = (this.configService as any)?.getZaiIsCodingPlan?.() || false;
                console.log('[LLMService] ZAI listModels Debug - isCodingPlan:', isCodingPlan, 'endpoint:', endpoint);

                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }
                // Use /models endpoint
                url = `${endpoint}/models`;
                break;
            default:
                throw new Error(`Unsupported LLM provider: ${provider}`);
        }

        try {
            console.log(`[LLMService] Listing models for provider: ${provider}, URL: ${url}`);
            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to list models from ${provider} at ${url}. Status: ${response.status}, Response: ${errorText}`);
            }

            const data = await response.json();

            switch (provider) {
                case 'openai':
                case 'groq':
                case 'openrouter':
                case 'xai':
                        if (data.data) {
                        models = data.data.map((m: any) => m.id);
                    } else {
                        console.error('[LLMService] Unexpected response format:', data);
                        throw new Error('Unexpected response format from API');
                    }
                    break;
                case 'ollama':
                    if (Array.isArray(data.models)) {
                        models = data.models.map((m: any) => m.name);
                    } else {
                        console.error('[LLMService] Unexpected Ollama response format:', data);
                        throw new Error('Unexpected response format from Ollama API');
                    }
                    break;
                case 'anthropic':
                    if (data.models) {
                        models = data.models.map((m: any) => m.id);
                    } else {
                        console.error('[LLMService] Unexpected Anthropic response format:', data);
                        throw new Error('Unexpected response format from Anthropic API');
                    }
                    break;
                case 'google':
                    if (Array.isArray(data.models)) {
                        models = data.models.map((m: any) => m.name);
                    } else {
                        console.error('[LLMService] Unexpected Google response format:', data);
                        throw new Error('Unexpected response format from Google API');
                    }
                    break;
                case 'zai':
                    console.log('[LLMService] ZAI Response data:', data);
                    if (data.data && Array.isArray(data.data)) {
                        models = data.data.map((m: any) => m.id);
                    } else {
                        console.error('[LLMService] Unexpected ZAI response format:', data);
                        throw new Error('Unexpected response format from ZAI API');
                    }
                    break;
            }
        } catch (error: any) {
            console.error(`[LLMService] Error listing models for ${provider}:`, error);
            throw error;
        }

        return models;
    }

    /**
     * Processes a streamed response from the LLM API.
     * It reads the stream chunk by chunk, decodes it, and parses the server-sent events (SSE).
     * As content and tool calls are received, they are accumulated and the onChunk callback is fired for content.
     * @param {ReadableStream<Uint8Array>} stream - The response body stream from the fetch API.
     * @param {(chunk: string) => void} onChunk - The callback to execute for each piece of content received.
     * @returns {Promise<LlmFullResponse>} A promise that resolves to the fully assembled response once the stream is complete.
     * @private
     */
    private async handleStreamedResponse(
        stream: ReadableStream<Uint8Array>,
        onChunk: (chunk: string) => void
    ): Promise<LlmFullResponse> {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = '';
        let accumulatedToolCalls: any[] = [];
        let usage: any = {};

        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep the last, possibly incomplete, line

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6);
                    if (jsonStr === '[DONE]') {
                        break;
                    }

                    try {
                        const chunk = JSON.parse(jsonStr);
                        const delta = chunk.choices?.[0]?.delta;

                        if (delta?.content) {
                            const contentChunk = delta.content;
                            accumulatedContent += contentChunk;
                            onChunk(contentChunk);
                        }

                        if (delta?.tool_calls) {
                            // This logic handles accumulating tool calls from multiple chunks
                            delta.tool_calls.forEach((toolCall: any, index: number) => {
                                if (!accumulatedToolCalls[index]) {
                                    accumulatedToolCalls[index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
                                }
                                if (toolCall.id) {
                                    accumulatedToolCalls[index].id = toolCall.id;
                                }
                                if (toolCall.function?.name) {
                                    accumulatedToolCalls[index].function.name = toolCall.function.name;
                                }
                                if (toolCall.function?.arguments) {
                                    accumulatedToolCalls[index].function.arguments += toolCall.function.arguments;
                                }
                            });
                        }
                        if (chunk.usage) {
                            usage = chunk.usage;
                        }
                    } catch (e) {
                        // It's not JSON. Assume it's a raw token to be treated as content.
                        const rawToken = jsonStr.trim();
                        if (rawToken) {
                            accumulatedContent += rawToken;
                            onChunk(rawToken);
                        }
                    }
                }
            }
        }

        const finalMessage: LlmMessage = { role: 'assistant', content: accumulatedContent };
        if (accumulatedToolCalls.length > 0) {
            finalMessage.tool_calls = accumulatedToolCalls;
        }

        return { choices: [{ message: finalMessage }], usage: usage };
    }
}