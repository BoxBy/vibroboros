/**
 * Model Info Provider
 *
 * 모델 메타데이터 관리 서비스입니다.
 * - 정적 레지스트리 조회
 * - 동적 API 조회 (Ollama, Google, OpenRouter, Groq)
 * - LiteLLM DB 조회
 * - ModelContextService 조회 (Z.ai, OpenAI, Anthropic, xAI)
 * - 캐싱 지원
 *
 * @pattern Strategy Pattern - Uses ILLMProviderStrategy for provider operations
 */

import { STATIC_MODEL_REGISTRY, DEFAULT_MODEL_INFO, ModelInfo } from '../../constants/ModelRegistry';
import { LLMProvider } from '../../services/LLMService';
import { LiteLLMService } from '../LiteLLMService';
import { ModelContextService } from '../ModelContextService';
import { IModelInfoProvider } from './IModelInfoProvider';
import { getProviderStrategy } from '../strategies';
import { ServiceLocator } from '../../di/ServiceLocator';

export class ModelInfoProvider implements IModelInfoProvider {
    private static instance: ModelInfoProvider;
    private modelInfoCache: Map<string, ModelInfo> = new Map();
    private configService: any;

    private constructor() {
        // ConfigService lazy load
    }

    public static getInstance(): ModelInfoProvider {
        if (!ModelInfoProvider.instance) {
            ModelInfoProvider.instance = new ModelInfoProvider();
        }
        return ModelInfoProvider.instance;
    }

    private getConfigService() {
        if (!this.configService) {
            this.configService = ServiceLocator.getConfigService();
        }
        return this.configService;
    }

    public async getModelInfo(provider: LLMProvider, model: string, apiKey?: string, endpoint?: string): Promise<ModelInfo> {
        // 1. User Override Check (Highest Priority)
        const userOverride = this.getUserOverride();
        if (typeof userOverride === 'number' && userOverride > 0) {
            const baseInfo = STATIC_MODEL_REGISTRY[model] || { ...DEFAULT_MODEL_INFO, id: model, provider };
            return {
                ...baseInfo,
                maxContextTokens: userOverride
            };
        }

        // 2. Static Registry & Cache Check
        // Note: Z.ai models are forced to dynamic lookup
        if (provider !== 'zai' && STATIC_MODEL_REGISTRY[model]) {
            return STATIC_MODEL_REGISTRY[model];
        }

        const cacheKey = `${provider}:${model}`;
        if (this.modelInfoCache.has(cacheKey)) {
            return this.modelInfoCache.get(cacheKey)!;
        }

        // 3. Dynamic Fetching
        let info: ModelInfo | null = null;

        try {
            // LiteLLM DB "Cheat Key" (High Reliability)
            if (!info) {
                const liteContext = await LiteLLMService.getContextLength(model);
                if (liteContext) {
                    info = {
                        id: model,
                        maxContextTokens: liteContext,
                        maxOutputTokens: 4096,
                        provider: provider as any,
                        supportsReasoning: model.includes('o1') || model.includes('reasoning'),
                        multimodal: model.includes('gpt-4') || model.includes('claude-3') || model.includes('gemini')
                    };
                }
            }

            // Provider-specific fetching
            if (!info) {
                switch (provider) {
                    case 'ollama':
                        info = await this.fetchOllamaModelInfo(model, endpoint);
                        break;
                    case 'google':
                        info = await this.fetchGoogleModelInfo(model, apiKey);
                        break;
                    case 'openrouter':
                        info = await this.fetchOpenRouterModelInfo(model, apiKey);
                        break;
                    case 'groq':
                        info = await this.fetchGroqModelInfo(model, apiKey);
                        break;
                    case 'openai':
                    case 'anthropic':
                    case 'xai':
                    case 'zai':
                        // ModelContextService for universal lookup
                        const dynamicContext = await ModelContextService.getMaxContextLength(provider, model);
                        if (dynamicContext && dynamicContext > 4096) {
                            info = {
                                id: model,
                                maxContextTokens: dynamicContext,
                                maxOutputTokens: (provider === 'anthropic' || model.includes('o1')) ? 8192 : 4096,
                                provider: provider as any,
                                supportsReasoning: model.includes('o1') || model.includes('reasoning'),
                                multimodal: model.includes('gpt-4') || model.includes('claude-3') || model.includes('o1')
                            };
                        }
                        break;
                }
            }
        } catch (error) {
            console.warn(`[ModelInfoProvider] Failed to fetch model info for ${model}:`, error);
        }

        // 4. Fallback
        const finalInfo = info || {
            ...DEFAULT_MODEL_INFO,
            id: model,
            provider: provider as any
        };

        this.modelInfoCache.set(cacheKey, finalInfo);
        return finalInfo;
    }

    public async listModels(provider: LLMProvider, apiKey: string, endpoint: string): Promise<string[]> {
        let models: string[] = [];
        let url = '';
        const headers: HeadersInit = {};

        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        switch (provider) {
            case 'openai': {
                const base = (endpoint || 'https://api.openai.com/v1').replace(/\/+$/, '');
                const stripped = base.replace(/\/(v1\/)?(chat\/)?completions?$/i, '');
                const hasV1 = /\/v1$/i.test(stripped);
                url = hasV1 ? `${stripped}/models` : `${stripped}/v1/models`;
                break;
            }
            case 'groq': {
                const base = (endpoint || 'https://api.groq.com/v1').replace(/\/+$/, '');
                const stripped = base.replace(/\/(openai\/)?v1(\/chat\/completions)?$/i, '');
                url = endpoint ? `${stripped}/v1/models` : 'https://api.groq.com/v1/models';
                break;
            }
            case 'openrouter': {
                const base = (endpoint || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
                const stripped = base.replace(/\/(api\/)?v1(\/chat\/completions)?$/i, '');
                url = endpoint ? `${stripped}/api/v1/models` : 'https://openrouter.ai/api/v1/models';
                break;
            }
            case 'ollama': {
                const ollamaBase = endpoint.endsWith('/api/chat') ? endpoint.replace('/api/chat', '') : endpoint;
                url = `${ollamaBase}/api/tags`;
                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }
                break;
            }
            case 'anthropic':
                url = 'https://api.anthropic.com/v1/models';
                headers['x-api-key'] = apiKey;
                headers['anthropic-version'] = '2023-06-01';
                break;
            case 'xai': {
                const base = (endpoint || 'https://api.xai.com/v1').replace(/\/+$/, '');
                const stripped = base.replace(/\/(v1\/)?chat\/completions$/i, '');
                const hasV1 = /\/v1$/i.test(stripped);
                url = hasV1 ? `${stripped}/models` : `${stripped}/v1/models`;
                break;
            }
            case 'google':
                url = `${endpoint.replace(/generateContent$/, '')}/models?key=${apiKey}`;
                break;
            default:
                throw new Error(`Unsupported LLM provider: ${provider}`);
        }

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
            });

            if (!response.ok) {
                throw new Error(`Failed to list models: ${response.status}`);
            }

            const data = await response.json();

            switch (provider) {
                case 'openai':
                case 'groq':
                case 'openrouter':
                case 'xai':
                    if (data.data) {
                        models = data.data.map((m: any) => m.id);
                    }
                    break;
                case 'ollama':
                    if (Array.isArray(data.models)) {
                        models = data.models.map((m: any) => m.name);
                    }
                    break;
                case 'anthropic':
                    if (data.models) {
                        models = data.models.map((m: any) => m.id);
                    }
                    break;
                case 'google':
                    if (Array.isArray(data.models)) {
                        models = data.models.map((m: any) => m.name);
                    }
                    break;
            }
        } catch (error) {
            console.error(`[ModelInfoProvider] Error listing models for ${provider}:`, error);
            throw error;
        }

        return models;
    }

    public clearCache(): void {
        this.modelInfoCache.clear();
    }

    public getUserOverride(): number | undefined {
        const configService = this.getConfigService();
        return configService.getMaxContextOverride();
    }

    // ========================================================================
    // Private Methods - Provider-specific fetching
    // ========================================================================

    private async fetchOllamaModelInfo(model: string, endpoint?: string): Promise<ModelInfo | null> {
        try {
            const baseUrl = endpoint || 'http://localhost:11434';
            const url = `${baseUrl.replace(/\/$/, '')}/api/show`;
            const response = await fetch(url, {
                method: 'POST',
                body: JSON.stringify({ name: model })
            });

            if (!response.ok) {
                return null;
            }

            const data = await response.json();
            const info = data.model_info || {};
            const params = data.parameters || '';
            const architecture = info['general.architecture'];

            // 1. Architecture-specific key
            if (architecture && info[`${architecture}.context_length`]) {
                return {
                    id: model,
                    maxContextTokens: parseInt(info[`${architecture}.context_length`]),
                    maxOutputTokens: 4096,
                    provider: 'ollama'
                };
            }

            // 2. Suffix scan
            const contextKey = Object.keys(info).find(k => k.endsWith('.context_length') || k === 'context_length');
            if (contextKey) {
                return {
                    id: model,
                    maxContextTokens: parseInt(info[contextKey]),
                    maxOutputTokens: 4096,
                    provider: 'ollama'
                };
            }

            // 3. Parameters string parsing
            let context = 0;
            if (params) {
                const match = params.match(/num_ctx\s+(\d+)/);
                if (match) {
                    context = parseInt(match[1]);
                }
            }

            return {
                id: model,
                maxContextTokens: context || 4096,
                maxOutputTokens: 4096,
                provider: 'ollama'
            };
        } catch (e) {
            console.warn('[ModelInfoProvider] Failed to fetch Ollama model info:', e);
            return null;
        }
    }

    private async fetchGoogleModelInfo(model: string, apiKey?: string): Promise<ModelInfo | null> {
        if (!apiKey) {
            return null;
        }
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${apiKey}`;
            const response = await fetch(url);

            if (!response.ok) {
                return null;
            }

            const data = await response.json();
            return {
                id: model,
                maxContextTokens: data.inputTokenLimit || 1000000,
                maxOutputTokens: data.outputTokenLimit || 8192,
                provider: 'google',
                multimodal: true
            };
        } catch (e) {
            console.warn('[ModelInfoProvider] Failed to fetch Google model info:', e);
            return null;
        }
    }

    private async fetchOpenRouterModelInfo(model: string, apiKey?: string): Promise<ModelInfo | null> {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                method: 'GET',
                headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : undefined
            });

            if (!response.ok) {
                return null;
            }

            const json = await response.json();
            const data = json.data as Array<any>;
            const match = data.find((m: any) => m.id === model);

            if (match) {
                return {
                    id: model,
                    maxContextTokens: match.context_length || 4096,
                    maxOutputTokens: match.per_request_limits?.output || 4096,
                    provider: 'openrouter',
                    multimodal: false
                };
            }
            return null;
        } catch (e) {
            console.warn('[ModelInfoProvider] Failed to fetch OpenRouter models:', e);
            return null;
        }
    }

    private async fetchGroqModelInfo(model: string, apiKey?: string): Promise<ModelInfo | null> {
        if (!apiKey) {
            return null;
        }
        try {
            const response = await fetch('https://api.groq.com/openai/v1/models', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });

            if (!response.ok) {
                return null;
            }

            const json = await response.json();
            const data = json.data as Array<any>;
            const match = data.find((m: any) => m.id === model);

            if (match) {
                return {
                    id: model,
                    maxContextTokens: match.context_window || 8192,
                    maxOutputTokens: 8192,
                    provider: 'groq'
                };
            }
            return null;
        } catch (e) {
            console.warn('[ModelInfoProvider] Failed to fetch Groq models:', e);
            return null;
        }
    }
}
