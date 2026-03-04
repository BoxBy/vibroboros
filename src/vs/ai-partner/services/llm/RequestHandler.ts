/**
 * Request Handler
 *
 * LLM 요청 처리 서비스입니다.
 * - Provider 패턴 지원
 * - 스트리밍 처리
 * - 재시도 로직
 * - 사용량 추적
 *
 * @pattern Strategy Pattern - Uses IRequestStrategy to eliminate switch statements
 */

import { IRequestHandler, CompletionParams, CompletionOptions } from './IRequestHandler';
import { LlmMessage, LlmFullResponse, LLMProvider } from '../../services/LLMService';
import { ILLMProvider } from './providers/ILLMProvider';
import { getRequestStrategy } from './strategies';
import { CompositionRoot, ServiceIdentifiers } from '../../di/CompositionRoot';
import { ConfigService } from '../../config_service';

export class RequestHandler implements IRequestHandler {
    private static instance: RequestHandler;
    private providers: Map<string, ILLMProvider> = new Map();
    private openAIEndpointCache: Map<string, string> = new Map();
    private usageTotals: { prompt_tokens: number; completion_tokens: number; total_tokens: number } = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
    };

    private constructor() {}

    public static getInstance(): RequestHandler {
        if (!RequestHandler.instance) {
            RequestHandler.instance = new RequestHandler();
        }
        return RequestHandler.instance;
    }

    public registerProvider(providerId: string, provider: ILLMProvider): void {
        this.providers.set(providerId, provider);
    }

    public supportsStreaming(_provider: LLMProvider): boolean {
        return true; // All supported providers support streaming
    }

    public getUsageTotals() {
        return { ...this.usageTotals };
    }

    public resetUsageTotals() {
        this.usageTotals = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    }

    private recordUsage(usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }) {
        if (!usage) {
            return;
        }
        const p = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
        const c = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0;
        const t = typeof usage.total_tokens === 'number' ? usage.total_tokens : (p + c) || 0;
        this.usageTotals.prompt_tokens += p;
        this.usageTotals.completion_tokens += c;
        this.usageTotals.total_tokens += t;
    }

    public async requestCompletion(params: CompletionParams): Promise<LlmFullResponse> {
        const {
            provider,
            conversationHistory,
            apiKey,
            endpoint,
            tools,
            model,
            onChunk,
            options,
            token: _token,
            maxTokens,
            modelInfo
        } = params;

        const configService = CompositionRoot.resolve<ConfigService>(ServiceIdentifiers.ConfigService);
        const effectiveTimeout = params.timeout ?? configService.getGlobalRequestTimeout();
        const effectiveTemperature = params.temperature ?? configService.getGlobalTemperature();

        const isLocalOllama = provider === 'ollama' && endpoint?.includes('localhost');
        const needsApiKey = !isLocalOllama && provider !== 'google';

        if (needsApiKey && !apiKey) {
            throw new Error("LLM API key is not configured. Please go to Settings to add your API key.");
        }

        // Strategy Pattern: Delegate to specific provider if registered
        if (this.providers.has(provider)) {
            const p = this.providers.get(provider)!;
            const result = await p.completion(conversationHistory, {
                model,
                apiKey,
                endpoint,
                temperature: effectiveTemperature,
                maxTokens: maxTokens || modelInfo?.maxOutputTokens,
                structured: options?.structured,
                tools: tools
            }, onChunk);

            if (result.usage) {
                this.recordUsage(result.usage);
            }
            return result;
        }

        // Try using Strategy Pattern for request building
        const strategy = getRequestStrategy(provider);
        if (strategy) {
            return this.handleStrategyRequest(params, strategy, effectiveTimeout, effectiveTemperature);
        }

        // Legacy Fallback for providers not yet migrated
        return this.handleLegacyRequest(params, effectiveTimeout, effectiveTemperature);
    }

    /**
     * Handle request using Strategy Pattern
     * Eliminates switch statements by delegating to provider-specific strategies
     */
    private async handleStrategyRequest(params: CompletionParams, strategy: any, effectiveTimeout: number, effectiveTemperature: number): Promise<LlmFullResponse> {
        const { provider, conversationHistory, apiKey, endpoint, tools, model, onChunk, token, options } = params;

        const request = strategy.buildRequest(conversationHistory, {
            model,
            apiKey,
            endpoint,
            tools,
            temperature: effectiveTemperature,
            options
        });

        return this.executeRequest(request.url, request.headers, request.body, provider, onChunk, effectiveTimeout, token, options);
    }

    private async handleLegacyRequest(params: CompletionParams, effectiveTimeout: number, effectiveTemperature: number): Promise<LlmFullResponse> {
        const {
            provider,
            conversationHistory,
            apiKey,
            endpoint,
            tools,
            model,
            onChunk,
            options,
            token
        } = params;

        let requestEndpoint = endpoint || '';
        let requestBody: any = {};
        let headers: any = { 'Content-Type': 'application/json' };

        switch (provider) {
            case 'openai':
            case 'groq':
            case 'openrouter': {
                requestBody = {
                    model,
                    messages: conversationHistory,
                    tools,
                    tool_choice: 'auto',
                    stream: !!onChunk,
                    temperature: effectiveTemperature,
                };

                if (options && options.structured) {
                    const so = options.structured;
                    if (so.mode === 'json_object') {
                        (requestBody as any).response_format = { type: 'json_object' } as any;
                    } else if (so.mode === 'json_schema' && so.schema) {
                        (requestBody as any).response_format = {
                            type: 'json_schema',
                            json_schema: { name: so.schemaName || 'schema', schema: so.schema }
                        } as any;
                    }
                    if (provider === 'groq' && (requestBody as any).response_format) {
                        (requestBody as any).stream = false;
                    }
                }

                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }

                requestEndpoint = await this.resolveOpenAICompatibleEndpoint(requestEndpoint, headers, requestBody, effectiveTimeout);
                break;
            }
            case 'ollama': {
                const ollamaMessages = conversationHistory.map(msg => {
                    if (Array.isArray(msg.content)) {
                        const textContent = msg.content
                            .filter(part => part.type === 'text')
                            .map(part => (part as any).text)
                            .join('\n');

                        const images = msg.content
                            .filter(part => part.type === 'image_url')
                            .map(part => {
                                const url = (part as any).image_url?.url || '';
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

                requestBody = { model, messages: ollamaMessages, stream: !!onChunk };

                if (tools && tools.length > 0) {
                    (requestBody as any).tools = tools;
                    (requestBody as any).tool_choice = 'auto';
                }

                if (options && options.structured) {
                    const so = options.structured;
                    (requestBody as any).format = (so.mode === 'json_object') ? 'json' : (so.schema || 'json');
                }

                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }

                requestEndpoint = `${endpoint.endsWith('/api/chat') ? endpoint : `${endpoint}/api/chat`}`;
                break;
            }
            case 'anthropic': {
                let anthropicTools: any[] | undefined;
                if (tools && tools.length > 0) {
                    anthropicTools = tools.map((tool: any) => {
                        const func = tool.function || tool;
                        const params = func.parameters || {};
                        return {
                            name: func.name || tool.name,
                            description: func.description || tool.description || '',
                            input_schema: {
                                type: 'object',
                                properties: params.properties || {},
                                required: params.required || []
                            }
                        };
                    });
                }

                requestBody = {
                    model,
                    messages: conversationHistory.map(msg => ({
                        role: msg.role === 'system' ? 'user' : msg.role,
                        content: msg.content
                    })),
                    max_tokens: 4096,
                    stream: !!onChunk,
                };

                if (anthropicTools && anthropicTools.length > 0) {
                    (requestBody as any).tools = anthropicTools;
                }

                if (apiKey) {
                    headers['x-api-key'] = apiKey;
                    headers['anthropic-version'] = '2023-06-01';
                }

                requestEndpoint = `${endpoint.endsWith('/messages') ? endpoint : `${endpoint}/messages`}`;
                break;
            }
            case 'google': {
                requestBody = {
                    contents: conversationHistory.map(msg => ({
                        role: msg.role === 'assistant' ? 'model' : msg.role,
                        parts: [{ text: msg.content }]
                    })),
                    tools,
                };

                if (options && options.structured) {
                    (requestBody as any).response_mime_type = 'application/json';
                    if (options.structured.schema) {
                        (requestBody as any).response_schema = options.structured.schema;
                    }
                }

                requestEndpoint = `${endpoint.replace(/generateContent$/, '')}/models/${model}:generateContent?key=${apiKey}`;
                break;
            }
            default:
                throw new Error(`Unsupported LLM provider: ${provider}`);
        }

        // Execute request
        return this.executeRequest(requestEndpoint, headers, requestBody, provider, onChunk, effectiveTimeout, token, options);
    }

    private async executeRequest(
        url: string,
        headers: any,
        body: any,
        provider: LLMProvider,
        onChunk?: (chunk: string) => void,
        timeout = 60000,
        token?: any,
        _options?: CompletionOptions
    ): Promise<LlmFullResponse> {
        const controller = new AbortController();

        if (token) {
            if (token.isCancellationRequested) {
                controller.abort();
            } else if (typeof token.onCancellationRequested === 'function') {
                token.onCancellationRequested(() => {
                    controller.abort();
                });
            }
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal
            });

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
                console.error('[RequestHandler] API Error:', errorMessage, errorData);
                return { choices: [{ message: { role: 'assistant', content: errorMessage } }] };
            }

            if (onChunk && (body as any).stream && (response as any).body) {
                const streamed = provider === 'ollama'
                    ? await this.handleOllamaStream((response as any).body, onChunk)
                    : await this.handleStreamedResponse((response as any).body, onChunk);

                this.recordUsage(streamed.usage as any);
                return streamed;
            } else {
                const data = await response.json();

                // Simulate streaming if onChunk provided but response is non-streaming
                if (onChunk) {
                    const content = data.choices?.[0]?.message?.content || '';
                    if (content) {
                        onChunk(content);
                    } else if (provider === 'google') {
                        const googleContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        if (googleContent) {
                            onChunk(googleContent);
                        }
                    } else if (provider === 'ollama' && data.message?.content) {
                        onChunk(data.message.content);
                    }
                }

                if (provider === 'google') {
                    const googleContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    return { choices: [{ message: { role: 'assistant', content: googleContent } }] };
                }
                if (provider === 'ollama') {
                    if (!data.message) {
                        const errorMessage = 'Ollama LLM did not return a valid message.';
                        console.error('[RequestHandler] Empty or malformed Ollama response:', data);
                        return { choices: [{ message: { role: 'assistant', content: errorMessage } }] };
                    }
                    const resp = { choices: [{ message: data.message }] } as any;
                    this.recordUsage(resp.usage);
                    return resp;
                } else if (!data.choices || data.choices.length === 0) {
                    const errorMessage = 'LLM did not return any choices.';
                    console.error('[RequestHandler] Empty or malformed response:', data);
                    return { choices: [{ message: { role: 'assistant', content: errorMessage } }] };
                }
                this.recordUsage(data.usage);
                return data;
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                throw new Error(`Request cancelled after ${timeout}ms timeout.`);
            }
            throw new Error(`**Connection Error:** Could not connect to the LLM service at ${url}. Original error: ${error.message}`);
        }
    }

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
            buffer = lines.pop() || '';

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
                            delta.tool_calls.forEach((toolCall: any, index: number) => {
                                if (!accumulatedToolCalls[index]) {
                                    accumulatedToolCalls[index] = {
                                        id: '',
                                        type: 'function',
                                        function: { name: '', arguments: '' }
                                    };
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
                        // Not JSON, treat as raw content
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

    private async handleOllamaStream(
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
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) {
                    continue;
                }

                try {
                    const obj = JSON.parse(trimmed);
                    const piece = (obj?.message?.content ?? obj?.response ?? '') as string;
                    if (piece) {
                        accumulatedContent += piece;
                        onChunk(piece);
                    }

                    if (obj?.message?.tool_calls) {
                        if (!accumulatedToolCalls) {
                            accumulatedToolCalls = [];
                        }
                        accumulatedToolCalls.push(...(Array.isArray(obj.message.tool_calls) ? obj.message.tool_calls : [obj.message.tool_calls]));
                    }

                    if (obj?.done && obj?.eval_count !== undefined) {
                        usage = { completion_tokens: obj.eval_count, total_tokens: obj.eval_count };
                    }
                } catch {
                    accumulatedContent += trimmed;
                    onChunk(trimmed);
                }
            }
        }

        const finalMessage: LlmMessage = { role: 'assistant', content: accumulatedContent };
        if (accumulatedToolCalls.length > 0) {
            finalMessage.tool_calls = accumulatedToolCalls;
        }
        return { choices: [{ message: finalMessage }], usage };
    }

    private async resolveOpenAICompatibleEndpoint(
        baseOrFull: string,
        headers: HeadersInit,
        body: any,
        timeout: number
    ): Promise<string> {
        const url = (baseOrFull || '').trim();
        if (!url) {
            return '';
        }

        const completionRegex = /(\/v1)?\/(chat\/)?(completions?)?$/;
        if (completionRegex.test(url)) {
            return url;
        }

        const base = url.replace(/\/+$/, '');

        if (this.openAIEndpointCache.has(base)) {
            return this.openAIEndpointCache.get(base)!;
        }

        const primary = `${base}/v1/chat/completions`;
        const alt = `${base}/chat/completions`;

        const candidates = [primary, alt];

        const perAttempt = Math.min(Math.max(4000, timeout || 60000), 8000);

        for (const candidate of candidates) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), perAttempt);

                const resp = await fetch(candidate, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...headers },
                    body: JSON.stringify({
                        model: body?.model || 'dummy-model',
                        messages: body?.messages || [{ role: 'user', content: 'ping' }],
                        stream: false
                    }),
                    signal: controller.signal
                } as RequestInit).catch((e) => { throw e; });

                clearTimeout(timer);

                if (resp.status !== 404) {
                    this.openAIEndpointCache.set(base, candidate);
                    return candidate;
                }
            } catch {
                continue;
            }
        }

        return primary;
    }
}
