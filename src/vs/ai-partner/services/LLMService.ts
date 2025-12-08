export type LlmMessageContent =
    | string
    | null
    | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

export type LlmMessage = {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: LlmMessageContent;
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

export type LLMProvider = 'openai' | 'ollama' | 'anthropic' | 'xai' | 'google' | 'groq' | 'openrouter';

/**
 * @class LLMService
 * @description A singleton service that manages all communication with a remote Large Language Model (LLM).
 * This service is responsible for sending prompts, handling API keys,
 * processing streamed responses, and managing connection and API errors.
 */
export class LLMService {
    private static instance: LLMService;
    private openAIEndpointCache: Map<string, string> = new Map();
    private usageTotals: { prompt_tokens: number; completion_tokens: number; total_tokens: number } = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    /**
     * Private constructor to prevent direct instantiation.
     */
    private constructor() {}

    /**
     * Gets the singleton instance of the service.
     */
    public static getInstance(): LLMService {
        if (!LLMService.instance) {
            LLMService.instance = new LLMService();
        }
        return LLMService.instance;
    }

    public getUsageTotals() {
        return { ...this.usageTotals };
    }

    public resetUsageTotals() {
        this.usageTotals = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    }

    private recordUsage(usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }) {
        if (!usage) { return; }
        const p = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
        const c = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0;
        const t = typeof usage.total_tokens === 'number' ? usage.total_tokens : (p + c) || 0;
        this.usageTotals.prompt_tokens += p;
        this.usageTotals.completion_tokens += c;
        this.usageTotals.total_tokens += t;
    }

    /**
     * Resolve an OpenAI-compatible endpoint given a base or full URL.
     * Tries multiple common paths and caches the first non-404 responder.
     */
    private async resolveOpenAICompatibleEndpoint(baseOrFull: string, headers: HeadersInit, body: any, timeout: number): Promise<string> {
        const url = (baseOrFull || '').trim();
        if (!url) { return ''; }

        // If it already looks like a chat/completions endpoint, return as-is
        const completionRegex = /(\/v1)?\/(chat\/)?completions?$/;
        if (completionRegex.test(url)) { return url; }

        // Normalize base (strip trailing slashes)
        const base = url.replace(/\/+$/, '');

        // Cache by base URL
        if (this.openAIEndpointCache.has(base)) { return this.openAIEndpointCache.get(base)!; }

        // Build a minimal candidate set to avoid long stalls
        const primary = `${base}/v1/chat/completions`;
        const alt = `${base}/chat/completions`;
        const candidates = [primary, alt];

        const requestBody = JSON.stringify({
            model: body?.model || 'dummy-model',
            messages: body?.messages || [{ role: 'user', content: 'ping' }],
            stream: false
        });

        const perAttempt = Math.min(Math.max(4000, timeout || 60000), 8000);
        for (const candidate of candidates) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), perAttempt);
                const resp = await fetch(candidate, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...headers },
                    body: requestBody,
                    signal: controller.signal
                } as RequestInit).catch((e) => { throw e; });
                clearTimeout(timer);
                if (resp.status !== 404) {
                    this.openAIEndpointCache.set(base, candidate);
                    return candidate;
                }
            } catch {
                // try next
                continue;
            }
        }
        // Default to primary form
        return primary;
    }

    private messagesToPrompt(history: LlmMessage[]): string {
        try {
            const parts = history
                .filter(m => typeof m.content === 'string' && !!m.content)
                .map(m => `${m.role}: ${m.content}`);
            return parts.join('\n');
        } catch {
            return '';
        }
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
     * @param {number} [timeout] - Optional timeout in milliseconds. Defaults to 60000 (60 seconds).
     * @returns {Promise<LlmFullResponse>} A promise that resolves to the full response object from the LLM.
     */
    public async requestLLMCompletion(
            provider: LLMProvider,
            conversationHistory: LlmMessage[],
            apiKey: string,
            endpoint: string,
            tools: any[],
            model: string,
            onChunk?: (chunk: string) => void,
            timeout: number = 60000,
            options?: { 
                structured?: { mode: 'json_object' | 'json_schema'; schema?: any; schemaName?: string },
                onRetry?: (attempt: number, maxRetries: number, error: any) => void
            }
        ): Promise<LlmFullResponse> {

            const isLocalOllama = provider === 'ollama' && endpoint.includes('localhost');
            const needsApiKey = !isLocalOllama && provider !== 'google';
            if (needsApiKey && !apiKey) {
                throw new Error("LLM API key is not configured. Please go to Settings to add your API key.");
            }

            let requestBody: any = {};
            let headers: HeadersInit = { 'Content-Type': 'application/json' };
            let requestEndpoint = endpoint;

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
                        temperature: 0.1,
                    };
                    // Structured outputs (OpenAI-compatible)
                    if (options && options.structured) {
                        const so = options.structured;
                        if (so.mode === 'json_object') {
                            (requestBody as any).response_format = { type: 'json_object' } as any;
                        } else if (so.mode === 'json_schema' && so.schema) {
                            (requestBody as any).response_format = { type: 'json_schema', json_schema: { name: so.schemaName || 'schema', schema: so.schema } } as any;
                        }
                        // Some providers (e.g., Groq) do not support streaming with structured outputs
                        if (provider === 'groq' && (requestBody as any).response_format) {
                            (requestBody as any).stream = false;
                        }
                    }
                    if (apiKey) { headers['Authorization'] = `Bearer ${apiKey}`; }
                    requestEndpoint = await this.resolveOpenAICompatibleEndpoint(endpoint, headers, requestBody, timeout);
                    if (/(\/v1)?\/(completions?|completion)$/.test(requestEndpoint) && !/chat\//.test(requestEndpoint)) {
                        requestBody = {
                            model,
                            prompt: this.messagesToPrompt(conversationHistory),
                            stream: !!onChunk,
                            temperature: 0.1,
                        };
                        if (options && options.structured) {
                            const so = options.structured;
                            if (so.mode === 'json_object') {
                                (requestBody as any).response_format = { type: 'json_object' } as any;
                            } else if (so.mode === 'json_schema' && so.schema) {
                                (requestBody as any).response_format = { type: 'json_schema', json_schema: { name: so.schemaName || 'schema', schema: so.schema } } as any;
                            }
                            if (provider === 'groq' && (requestBody as any).response_format) {
                                (requestBody as any).stream = false;
                            }
                        }
                    }
                    break;
                }
                case 'ollama': {
                    // Ollama (Go implementation) expects 'content' to be a string, not an array of objects
                    // For multimodal, images must be passed in a separate 'images' array (base64)
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
                                    // Strip data URI prefix if present to get raw base64
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
                    // Ollama supports OpenAI-compatible tools format
                    if (tools && tools.length > 0) {
                        (requestBody as any).tools = tools;
                        (requestBody as any).tool_choice = 'auto';
                    }
                    // Structured outputs (Ollama): format can be 'json' or a JSON schema object
                    if (options && options.structured) {
                        const so = options.structured;
                        (requestBody as any).format = (so.mode === 'json_object') ? 'json' : (so.schema || 'json');
                    }
                    if (apiKey) { headers['Authorization'] = `Bearer ${apiKey}`; }
                    requestEndpoint = `${endpoint.endsWith('/api/chat') ? endpoint : `${endpoint}/api/chat`}`;
                    if (requestEndpoint.includes('ollama.com') && (!apiKey || apiKey.trim() === '')) {
                        const errorMessage = 'Ollama Cloud requires a valid API key. Please set your Ollama API key in the extension settings.';
                        return { choices: [{ message: { role: 'assistant', content: errorMessage } }] };
                    }
                    break;
                }
                case 'anthropic': {
                    // Convert OpenAI-format tools to Anthropic format
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
                        messages: conversationHistory.map(msg => ({ role: msg.role === 'system' ? 'user' : msg.role, content: msg.content })),
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
                case 'xai': {
                    requestBody = { model, messages: conversationHistory, tools, tool_choice: 'auto', stream: !!onChunk };
                    if (options && options.structured) {
                        const so = options.structured;
                        if (so.mode === 'json_object') {
                            (requestBody as any).response_format = { type: 'json_object' } as any;
                        } else if (so.mode === 'json_schema' && so.schema) {
                            (requestBody as any).response_format = { type: 'json_schema', json_schema: { name: so.schemaName || 'schema', schema: so.schema } } as any;
                        }
                    }
                    if (apiKey) { headers['Authorization'] = `Bearer ${apiKey}`; }
                    if (endpoint) {
                        const resolved = await this.resolveOpenAICompatibleEndpoint(endpoint, headers, requestBody, timeout);
                        requestEndpoint = resolved;
                        if (/(\/v1)?\/(completions?|completion)$/.test(resolved) && !/chat\//.test(resolved)) {
                            requestBody = { model, prompt: this.messagesToPrompt(conversationHistory), stream: !!onChunk };
                            if (options && options.structured) {
                                const so = options.structured;
                                if (so.mode === 'json_object') {
                                    (requestBody as any).response_format = { type: 'json_object' } as any;
                                } else if (so.mode === 'json_schema' && so.schema) {
                                    (requestBody as any).response_format = { type: 'json_schema', json_schema: { name: so.schemaName || 'schema', schema: so.schema } } as any;
                                }
                            }
                        }
                    }
                    break;
                }
                case 'google': {
                    requestBody = {
                        contents: conversationHistory.map(msg => ({ role: msg.role === 'assistant' ? 'model' : msg.role, parts: [{ text: msg.content }] })),
                        tools,
                    };
                    if (options && options.structured) {
                        (requestBody as any).response_mime_type = 'application/json';
                        if (options.structured.schema) {
                            (requestBody as any).response_schema = options.structured.schema;
                        }
                    }
                    requestEndpoint = `${endpoint.endsWith('/generateContent') ? endpoint : `${endpoint}/models/${model}:generateContent`}?key=${apiKey}`;
                    break;
                }
                default:
                    throw new Error(`Unsupported LLM provider: ${provider}`);
            }

            try {
                // const callStart = Date.now();
                // const preview = (() => {
                //     try {
                //         const msg = this.messagesToPrompt(conversationHistory);
                //         return msg.length > 600 ? (msg.slice(0, 600) + '…') : msg;
                //     } catch { return ''; }
                // })();
                // console.log(`[LLMService] Request start -> provider=${provider} endpoint=${requestEndpoint} model=${model} timeout=${timeout}`);
                // try { console.log(`[LLMService] Prompt preview (${conversationHistory.length} msgs):\n${preview}`); } catch {}
                const fetchOnce = (url: string) => fetch(url, { method: 'POST', headers, body: JSON.stringify(requestBody) });

                let response: Response;
                const doFetchWithFallbacks = async (): Promise<Response> => {
                    const isOpenAICompatible = (provider === 'openai' || provider === 'groq' || provider === 'openrouter' || provider === 'xai');
                    const isCompletion = /(\/v1)?\/(chat\/)?completions?$/;
                    const perAttemptTimeoutMs = Math.min(Math.max(4000, timeout || 60000), 12000);

                    const maxRetries = 20;
                    let attempt = 0;
                    let lastError: any;

                    while (attempt < maxRetries) {
                        try {
                            // For non-OpenAI providers (google/ollama/anthropic), do NOT try OpenAI-style fallbacks.
                            if (!isOpenAICompatible) {
                                return await Promise.race([
                                    fetchOnce(requestEndpoint),
                                    new Promise((_, reject) => setTimeout(() => reject(new Error(`Request timed out after ${timeout}ms`)), timeout))
                                ]) as Response;
                            }

                            const defaultsByProvider: Record<string, string> = {
                                openai: 'https://api.openai.com',
                                groq: 'https://api.groq.com/openai',
                                openrouter: 'https://openrouter.ai/api',
                                xai: 'https://api.xai.com'
                            };
                            const baseCandidate = (requestEndpoint && requestEndpoint.trim().length > 0)
                                ? requestEndpoint.replace(/\/+$/, '')
                                : (defaultsByProvider[provider] || 'https://api.openai.com');
                            const tryUrls: string[] = [];
                            const primary = isCompletion.test(baseCandidate) ? baseCandidate : `${baseCandidate}/v1/chat/completions`;
                            tryUrls.push(primary);
                            // Add at most one alternative form to avoid multi-minute stalls
                            if (!isCompletion.test(baseCandidate)) {
                                tryUrls.push(`${baseCandidate}/chat/completions`);
                            }

                            for (const url of tryUrls) {
                                try {
                                    const resp = await Promise.race([
                                        fetchOnce(url),
                                        new Promise((_, reject) => setTimeout(() => reject(new Error(`Request timed out after ${perAttemptTimeoutMs}ms`)), perAttemptTimeoutMs))
                                    ]) as Response;
                                    if (resp.status === 404) { continue; }
                                    if (isOpenAICompatible) {
                                        const baseKey = requestEndpoint.replace(/\/+$/, '');
                                        if (!isCompletion.test(baseKey)) {
                                            const origin = baseKey;
                                            this.openAIEndpointCache.set(origin, url);
                                        }
                                    }
                                    return resp;
                                } catch {
                                    continue;
                                }
                            }
                            return await Promise.race([
                                fetchOnce(primary),
                                new Promise((_, reject) => setTimeout(() => reject(new Error(`Request timed out after ${perAttemptTimeoutMs}ms`)), perAttemptTimeoutMs))
                            ]) as Response;

                        } catch (error: any) {
                            lastError = error;
                            attempt++;
                            const isTimeout = error.message?.includes('timed out');
                            const isNetworkError = error.message?.includes('Failed to fetch') || error.name === 'TypeError';
                            
                            if (attempt < maxRetries && (isTimeout || isNetworkError)) {
                                // Exponential backoff with cap: 2s, 4s, 8s, 10s, 10s...
                                const delay = Math.min(Math.pow(2, attempt) * 1000, 10000);
                                console.warn(`[LLMService] Request failed (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms... Error: ${error.message}`);
                                if (options?.onRetry) {
                                    options.onRetry(attempt, maxRetries, error);
                                }
                                await new Promise(resolve => setTimeout(resolve, delay));
                                continue;
                            }
                            throw error;
                        }
                    }
                    throw lastError || new Error('Request failed after retries');
                };

                response = await doFetchWithFallbacks();
                // console.log(`[LLMService] Request finished in ${Date.now() - callStart}ms -> status=${response.status}`);

                if (!response.ok) {
                    // Ollama fallback: if structured outputs caused a 500, retry with format='json' and then without any format
                    if (provider === 'ollama' && options?.structured) {
                        try {
                            const originalFormat = (requestBody as any).format;
                            const shouldForceJson = (typeof originalFormat === 'object') || originalFormat === undefined;
                            if (shouldForceJson) {
                                (requestBody as any).format = 'json';
                                const retryResp = await fetchOnce(requestEndpoint);
                                console.log(`[LLMService] Ollama fallback(format=json) -> status=${retryResp.status}`);
                                if (retryResp.ok) {
                                    response = retryResp;
                                } else {
                                    // Second fallback: remove format entirely and try once more
                                    delete (requestBody as any).format;
                                    const retryResp2 = await fetchOnce(requestEndpoint);
                                    console.log(`[LLMService] Ollama fallback(no format) -> status=${retryResp2.status}`);
                                    if (retryResp2.ok) {
                                        response = retryResp2;
                                    } else {
                                        response = retryResp2; // keep latest failure for error propagation
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('[LLMService] Ollama fallback attempt failed:', e);
                        }
                    }

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
                }

                if (onChunk && (requestBody as any).stream && (response as any).body) {
                    // console.log(`[LLMService] Processing streaming response for provider: ${provider}`);
                    const streamed = provider === 'ollama'
                        ? await this.handleOllamaStream((response as any).body, onChunk)
                        : await this.handleStreamedResponse((response as any).body, onChunk);
                    // console.log(`[LLMService] Streaming complete. content length: ${String(streamed.choices?.[0]?.message?.content || '').length}`);
                    this.recordUsage(streamed.usage as any);
                    return streamed;
                } else {
                    // console.log(`[LLMService] Parsing non-streaming response for provider: ${provider}`);
                    const data = await response.json();
                    // console.log(`[LLMService] Parsed response data. Has message: ${!!data.message}, has choices: ${!!data.choices}`);
                    
                    if (provider === 'google') {
                        const googleContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        // try { console.log(`[LLMService] Response preview (google): ${googleContent.slice(0, 600)}`); } catch {}
                        return { choices: [{ message: { role: 'assistant', content: googleContent } }] };
                    }
                    if (provider === 'ollama') {
                        // console.log(`[LLMService] Processing Ollama response. data.message: ${!!data.message}, data.message.content: ${!!data.message?.content}, data.message.tool_calls: ${!!data.message?.tool_calls}`);
                        // Ollama can return tool_calls with empty content, which is valid
                        if (!data.message) {
                            const errorMessage = 'Ollama LLM did not return a valid message. The response might be empty or malformed.';
                            console.error('[LLMService] Empty or malformed Ollama response:', data);
                            return { choices: [{ message: { role: 'assistant', content: errorMessage } }] };
                        }
                        // If there are tool_calls, empty content is acceptable
                        if (!data.message.content && (!data.message.tool_calls || data.message.tool_calls.length === 0)) {
                            const errorMessage = 'Ollama LLM did not return content or tool_calls. The response might be empty or malformed.';
                            console.error('[LLMService] Empty or malformed Ollama response:', data);
                            return { choices: [{ message: { role: 'assistant', content: errorMessage } }] };
                        }
                        const resp = { choices: [{ message: data.message }] } as any;
                        try { 
                            // const contentPreview = data.message?.content ? String(data.message.content).slice(0, 600) : '';
                            // const toolCallsInfo = data.message?.tool_calls ? ` [${data.message.tool_calls.length} tool_calls]` : '';
                            // console.log(`[LLMService] Response preview (ollama): ${contentPreview}${toolCallsInfo}`); 
                            // console.log(`[LLMService] data.message structure: content type=${typeof data.message?.content}, content length=${String(data.message?.content || '').length}, has tool_calls=${!!data.message?.tool_calls}, tool_calls count=${data.message?.tool_calls?.length || 0}`);
                        } catch {}
                        // console.log(`[LLMService] Returning Ollama response. choices length: ${resp.choices?.length || 0}`);
                        // console.log(`[LLMService] resp.choices[0].message structure: content type=${typeof resp.choices[0]?.message?.content}, content length=${String(resp.choices[0]?.message?.content || '').length}, has tool_calls=${!!resp.choices[0]?.message?.tool_calls}`);
                        this.recordUsage(resp.usage);
                        return resp;
                    } else if (!data.choices || data.choices.length === 0) {
                        const errorMessage = 'LLM did not return any choices. The response might be empty or malformed.';
                        console.error('[LLMService] Empty or malformed response:', data);
                        return { choices: [{ message: { role: 'assistant', content: errorMessage } }] };
                    }
                    this.recordUsage(data.usage);
                    // try { console.log(`[LLMService] Response preview: ${String(data.choices?.[0]?.message?.content || '').slice(0, 600)}`); } catch {}
                    // console.log(`[LLMService] Returning response. choices length: ${data.choices?.length || 0}`);
                    return data;
                }

            } catch (error: any) {
                let detailedErrorMessage = `**Connection Error:** Could not connect to the LLM service at ${requestEndpoint}.`;
                if (error?.message?.includes?.('Request timed out')) {
                    detailedErrorMessage = `**Connection Error:** Request to LLM service at ${requestEndpoint} timed out after ${timeout}ms. This might indicate a slow server or network issue.`;
                } else if (error?.message?.includes?.('Failed to fetch') || error?.name === 'TypeError') {
                    detailedErrorMessage = `**Network Error:** Could not reach the LLM service at ${requestEndpoint}. Please check your internet connection, firewall settings, or if the LLM service is running and accessible. Original error: ${error.message}`;
                } else {
                    detailedErrorMessage = `**Unexpected Connection Error:** An unexpected error occurred while trying to connect to the LLM service at ${requestEndpoint}. Please check the endpoint and your network. Original error: ${error.message}`;
                }
                console.error('[LLMService] LLM request failed:', error);
                // Throw the error so callers can handle it (e.g., retry, fallback, or display error)
                throw new Error(detailedErrorMessage);
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
                {
                    // Derive from custom endpoint if provided, else default
                    const base = (endpoint || 'https://api.openai.com/v1').replace(/\/+$/, '');
                    // Strip known completions paths
                    const stripped = base.replace(/\/(v1\/)?(chat\/)?completions?$/i, '');
                    // Ensure we end up at /v1/models if possible
                    const hasV1 = /\/v1$/i.test(stripped);
                    url = hasV1 ? `${stripped}/models` : `${stripped}/v1/models`;
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }
                break;
            case 'groq':
                {
                    const base = (endpoint || 'https://api.groq.com/v1').replace(/\/+$/, '');
                    const stripped = base.replace(/\/(openai\/)?v1(\/chat\/completions)?$/i, '');
                    // Prefer Groq's public models route when endpoint empty; otherwise try to use provided base
                    url = endpoint ? `${stripped}/v1/models` : 'https://api.groq.com/v1/models';
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }
                break;
            case 'openrouter':
                {
                    const base = (endpoint || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
                    const stripped = base.replace(/\/(api\/)?v1(\/chat\/completions)?$/i, '');
                    url = endpoint ? `${stripped}/api/v1/models` : 'https://openrouter.ai/api/v1/models';
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }
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
                {
                    const base = (endpoint || 'https://api.xai.com/v1').replace(/\/+$/, '');
                    const stripped = base.replace(/\/(v1\/)?chat\/completions$/i, '');
                    const hasV1 = /\/v1$/i.test(stripped);
                    url = hasV1 ? `${stripped}/models` : `${stripped}/v1/models`;
                }
                break;
            case 'google':
                url = `${endpoint.replace(/generateContent$/, '')}/models?key=${apiKey}`;
                break;
            default:
                throw new Error(`Unsupported LLM provider: ${provider}`);
        }

        try {
            // Removed verbose models listing log
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
                    break;
                default:
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

        console.log(`[LLMService] Starting Ollama stream processing...`);
        while (true) {
            const { done, value } = await reader.read();
            if (done) { break; }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) { continue; }
                try {
                    const obj = JSON.parse(trimmed);
                    const piece = (obj?.message?.content ?? obj?.response ?? '') as string;
                    if (piece) {
                        accumulatedContent += piece;
                        onChunk(piece);
                    }
                    // Handle tool_calls in streaming response
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
        console.log(`[LLMService] Ollama stream complete. accumulatedContent length: ${accumulatedContent.length}, tool_calls count: ${accumulatedToolCalls.length}`);
        const finalMessage: LlmMessage = { role: 'assistant', content: accumulatedContent };
        if (accumulatedToolCalls.length > 0) {
            finalMessage.tool_calls = accumulatedToolCalls;
        }
        return { choices: [{ message: finalMessage }], usage };
    }
}