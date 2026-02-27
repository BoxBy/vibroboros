/**
 * LLM Request Strategies
 * Strategy pattern for different LLM providers
 *
 * This module implements the Strategy Pattern to eliminate switch statements
 * in the RequestHandler. Each provider has its own strategy for building
 * requests and parsing responses.
 */

import { LlmMessage } from '../../LLMService';

// ============================================================================
// Types
// ============================================================================

/**
 * Request building options
 */
export interface RequestBuildOptions {
    model: string;
    apiKey?: string;
    endpoint?: string;
    temperature?: number;
    maxTokens?: number;
    tools?: any[];
    structured?: { mode: 'json_object' | 'json_schema'; schema?: any; schemaName?: string };
    stream?: boolean;
}

/**
 * Built request result
 */
export interface BuiltRequest {
    url: string;
    headers: Record<string, string>;
    body: any;
}

/**
 * Strategy for building LLM requests and parsing responses
 */
export interface RequestStrategy {
    name: string;

    /**
     * Build the request for this provider
     */
    buildRequest(messages: LlmMessage[], options: RequestBuildOptions): BuiltRequest;

    /**
     * Parse the response from this provider
     */
    parseResponse(response: any): { content: string; toolCalls?: any[]; usage?: any };

    /**
     * Parse a streaming chunk (optional)
     */
    parseStreamChunk?(chunk: string): { content: string; done: boolean; toolCalls?: any[] };
}

// ============================================================================
// Strategy Registry
// ============================================================================

const strategies = new Map<string, RequestStrategy>();

/**
 * Register a strategy for a provider
 */
export function registerStrategy(strategy: RequestStrategy): void {
    strategies.set(strategy.name, strategy);
}

/**
 * Get a strategy for a provider
 */
export function getRequestStrategy(providerName: string): RequestStrategy | undefined {
    return strategies.get(providerName);
}

/**
 * Build a request using the registered strategy
 * @deprecated Use strategy.buildRequest directly
 */
export function buildProviderRequest(
    providerName: string,
    messages: LlmMessage[],
    options: RequestBuildOptions
): BuiltRequest {
    const strategy = strategies.get(providerName);
    if (!strategy) {
        // Default fallback
        return {
            url: options.endpoint || '',
            headers: { 'Content-Type': 'application/json' },
            body: { messages, ...options }
        };
    }
    return strategy.buildRequest(messages, options);
}

/**
 * Get all registered provider names
 */
export function getRegisteredProviders(): string[] {
    return Array.from(strategies.keys());
}

// ============================================================================
// Strategy Implementations
// ============================================================================

/**
 * OpenAI-compatible strategy (works for OpenAI, Groq, OpenRouter, etc.)
 */
const openaiStrategy: RequestStrategy = {
    name: 'openai',

    buildRequest(messages, options) {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        if (options.apiKey) {
            headers['Authorization'] = `Bearer ${options.apiKey}`;
        }

        const body: any = {
            model: options.model,
            messages,
            temperature: options.temperature ?? 0.1,
            stream: options.stream ?? false
        };

        if (options.tools?.length) {
            body.tools = options.tools;
            body.tool_choice = 'auto';
        }

        if (options.maxTokens) {
            body.max_tokens = options.maxTokens;
        }

        // Structured output
        if (options.structured) {
            if (options.structured.mode === 'json_object') {
                body.response_format = { type: 'json_object' };
            } else if (options.structured.mode === 'json_schema' && options.structured.schema) {
                body.response_format = {
                    type: 'json_schema',
                    json_schema: {
                        name: options.structured.schemaName || 'schema',
                        schema: options.structured.schema
                    }
                };
            }
        }

        let url = options.endpoint || 'https://api.openai.com/v1/chat/completions';
        if (!url.includes('/chat/completions')) {
            url = url.replace(/\/+$/, '') + '/v1/chat/completions';
        }

        return { url, headers, body };
    },

    parseResponse(response) {
        const choice = response.choices?.[0];
        return {
            content: choice?.message?.content || '',
            toolCalls: choice?.message?.tool_calls,
            usage: response.usage
        };
    },

    parseStreamChunk(chunk) {
        if (chunk === '[DONE]') {
            return { content: '', done: true };
        }

        try {
            const data = JSON.parse(chunk);
            const delta = data.choices?.[0]?.delta;
            return {
                content: delta?.content || '',
                done: false,
                toolCalls: delta?.tool_calls
            };
        } catch {
            return { content: '', done: false };
        }
    }
};

/**
 * Anthropic Claude strategy
 */
const anthropicStrategy: RequestStrategy = {
    name: 'anthropic',

    buildRequest(messages, options) {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
        };

        if (options.apiKey) {
            headers['x-api-key'] = options.apiKey;
        }

        // Convert messages - Anthropic doesn't support system role in messages
        const convertedMessages = messages.map(msg => ({
            role: msg.role === 'system' ? 'user' : msg.role,
            content: msg.content
        }));

        const body: any = {
            model: options.model,
            messages: convertedMessages,
            max_tokens: options.maxTokens ?? 4096,
            stream: options.stream ?? false
        };

        if (options.tools?.length) {
            body.tools = options.tools.map((tool: any) => {
                const func = tool.function || tool;
                return {
                    name: func.name || tool.name,
                    description: func.description || tool.description || '',
                    input_schema: {
                        type: 'object',
                        properties: func.parameters?.properties || {},
                        required: func.parameters?.required || []
                    }
                };
            });
        }

        let url = options.endpoint || 'https://api.anthropic.com/v1/messages';
        if (!url.endsWith('/messages')) {
            url = url.replace(/\/+$/, '') + '/messages';
        }

        return { url, headers, body };
    },

    parseResponse(response) {
        const content = response.content?.[0]?.text || '';
        return {
            content,
            toolCalls: response.tool_calls,
            usage: {
                prompt_tokens: response.usage?.input_tokens,
                completion_tokens: response.usage?.output_tokens,
                total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
            }
        };
    }
};

/**
 * Ollama strategy
 */
const ollamaStrategy: RequestStrategy = {
    name: 'ollama',

    buildRequest(messages, options) {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        if (options.apiKey) {
            headers['Authorization'] = `Bearer ${options.apiKey}`;
        }

        // Convert messages for Ollama format
        const ollamaMessages = messages.map(msg => {
            if (Array.isArray(msg.content)) {
                const textContent = msg.content
                    .filter(part => part.type === 'text')
                    .map((part: any) => part.text)
                    .join('\n');

                const images = msg.content
                    .filter(part => part.type === 'image_url')
                    .map((part: any) => {
                        const url = part.image_url?.url || '';
                        const match = url.match(/^data:image\/[a-z]+;base64,(.+)$/);
                        return match ? match[1] : url;
                    })
                    .filter(img => !!img);

                return {
                    ...msg,
                    content: textContent,
                    images: images.length > 0 ? images : undefined
                };
            }
            return msg;
        });

        const body: any = {
            model: options.model,
            messages: ollamaMessages,
            stream: options.stream ?? false
        };

        if (options.tools?.length) {
            body.tools = options.tools;
            body.tool_choice = 'auto';
        }

        if (options.structured) {
            body.format = options.structured.mode === 'json_object' ? 'json' : (options.structured.schema || 'json');
        }

        let url = options.endpoint || 'http://localhost:11434';
        if (!url.includes('/api/chat')) {
            url = url.replace(/\/+$/, '') + '/api/chat';
        }

        return { url, headers, body };
    },

    parseResponse(response) {
        return {
            content: response.message?.content || '',
            toolCalls: response.message?.tool_calls,
            usage: {
                prompt_tokens: response.prompt_eval_count,
                completion_tokens: response.eval_count,
                total_tokens: (response.prompt_eval_count || 0) + (response.eval_count || 0)
            }
        };
    },

    parseStreamChunk(chunk) {
        try {
            const data = JSON.parse(chunk);
            const content = data.message?.content || data.response || '';
            return {
                content,
                done: data.done === true,
                toolCalls: data.message?.tool_calls
            };
        } catch {
            return { content: chunk, done: false };
        }
    }
};

/**
 * Google Gemini strategy
 */
const googleStrategy: RequestStrategy = {
    name: 'google',

    buildRequest(messages, options) {
        // Google uses API key in URL, not header
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };

        // Convert messages for Google format
        const contents = messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : msg.role,
            parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }]
        }));

        const body: any = {
            contents,
            generationConfig: {
                temperature: options.temperature ?? 0.1,
                maxOutputTokens: options.maxTokens
            }
        };

        if (options.tools?.length) {
            body.tools = options.tools;
        }

        if (options.structured) {
            body.generationConfig.response_mime_type = 'application/json';
            if (options.structured.schema) {
                body.generationConfig.response_schema = options.structured.schema;
            }
        }

        // Google requires API key in URL
        let url = options.endpoint || `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent`;
        if (!url.includes('?key=')) {
            url = `${url}?key=${options.apiKey}`;
        }

        return { url, headers, body };
    },

    parseResponse(response) {
        const content = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return {
            content,
            toolCalls: response.candidates?.[0]?.content?.parts?.filter((p: any) => p.functionCall).map((p: any) => p.functionCall),
            usage: {
                prompt_tokens: response.usageMetadata?.promptTokenCount,
                completion_tokens: response.usageMetadata?.candidatesTokenCount,
                total_tokens: response.usageMetadata?.totalTokenCount
            }
        };
    }
};

/**
 * Groq strategy (OpenAI-compatible)
 */
const groqStrategy: RequestStrategy = {
    name: 'groq',

    buildRequest(messages, options) {
        const request = openaiStrategy.buildRequest(messages, options);
        // Groq has some limitations
        if (options.structured?.mode) {
            request.body.stream = false;
        }
        return request;
    },

    parseResponse: openaiStrategy.parseResponse,
    parseStreamChunk: openaiStrategy.parseStreamChunk
};

/**
 * OpenRouter strategy (OpenAI-compatible)
 */
const openrouterStrategy: RequestStrategy = {
    name: 'openrouter',

    buildRequest(messages, options) {
        const request = openaiStrategy.buildRequest(messages, options);
        // OpenRouter specific headers
        request.headers['HTTP-Referer'] = 'https://viper.dev';
        request.headers['X-Title'] = 'Viper AI Assistant';
        return request;
    },

    parseResponse: openaiStrategy.parseResponse,
    parseStreamChunk: openaiStrategy.parseStreamChunk
};

/**
 * xAI (Grok) strategy (OpenAI-compatible)
 */
const xaiStrategy: RequestStrategy = {
    name: 'xai',

    buildRequest(messages, options) {
        const request = openaiStrategy.buildRequest(messages, options);
        if (!options.endpoint) {
            request.url = 'https://api.x.ai/v1/chat/completions';
        }
        return request;
    },

    parseResponse: openaiStrategy.parseResponse,
    parseStreamChunk: openaiStrategy.parseStreamChunk
};

/**
 * ZAI strategy (custom provider)
 */
const zaiStrategy: RequestStrategy = {
    name: 'zai',

    buildRequest(messages, options) {
        return openaiStrategy.buildRequest(messages, options);
    },

    parseResponse: openaiStrategy.parseResponse,
    parseStreamChunk: openaiStrategy.parseStreamChunk
};

// ============================================================================
// Register Default Strategies
// ============================================================================

registerStrategy(openaiStrategy);
registerStrategy(anthropicStrategy);
registerStrategy(ollamaStrategy);
registerStrategy(googleStrategy);
registerStrategy(groqStrategy);
registerStrategy(openrouterStrategy);
registerStrategy(xaiStrategy);
registerStrategy(zaiStrategy);

// ============================================================================
// Exports
// ============================================================================

export {
    openaiStrategy,
    anthropicStrategy,
    ollamaStrategy,
    googleStrategy,
    groqStrategy,
    openrouterStrategy,
    xaiStrategy,
    zaiStrategy
};

// Types are already exported above with 'export interface'
