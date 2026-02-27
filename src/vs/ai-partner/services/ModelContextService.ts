
interface OpenRouterModel {
    id: string;
    name: string;
    context_length: number;
    pricing: {
        prompt: string;
        completion: string;
    };
}

interface OpenRouterResponse {
    data: OpenRouterModel[];
}

/**
 * Service to fetch model specifications (Context Window, etc.) from OpenRouter API.
 * Acts as a "Metadata DB" for providers that do not expose this info via their own APIs
 * (e.g., OpenAI, Anthropic, xAI).
 */
export class ModelContextService {
    private static CACHE_TTL = 1000 * 60 * 60; // 1 hour cache
    private static cachedModels: OpenRouterModel[] | null = null;
    private static lastFetchTime = 0;

    /**
     * Fetches the full list of models from OpenRouter API and caches it.
     */
    private static async fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
        const now = Date.now();

        // Use cache if valid
        if (this.cachedModels && (now - this.lastFetchTime < this.CACHE_TTL)) {
            return this.cachedModels;
        }

        try {
            const response = await fetch('https://openrouter.ai/api/v1/models');
            if (!response.ok) {
                console.warn(`[ModelContextService] OpenRouter API Error: ${response.statusText}`);
                return [];
            }

            const json = (await response.json()) as OpenRouterResponse;
            this.cachedModels = json.data;
            this.lastFetchTime = now;
            return this.cachedModels;
        } catch (error) {
            console.error("[ModelContextService] Failed to fetch model specs from OpenRouter:", error);
            return [];
        }
    }

    /**
     * Retrieves the Max Context Length for a given model ID.
     * Uses OpenRouter metadata lookup with fuzzy matching.
     * 
     * @param provider - 'openai', 'anthropic', 'xai', etc.
     * @param modelId - 'gpt-4o', 'claude-3-5-sonnet', 'grok-beta', etc.
     */
    public static async getMaxContextLength(provider: string, modelId: string): Promise<number> {
        // 1. Lookup in OpenRouter DB
        const models = await this.fetchOpenRouterModels();

        // OpenRouter IDs are like 'openai/gpt-4o'. Match if our modelId is included or matches.
        const matchedModel = models.find(m => {
            return m.id === modelId || m.id.endsWith(`/${modelId}`) || m.id.includes(modelId);
        });

        if (matchedModel) {
            return matchedModel.context_length;
        }

        // 2. Fallback if not found in OpenRouter (or API failed)
        return this.getFallbackContext(provider, modelId);
    }

    private static getFallbackContext(provider: string, modelId: string): number {
        const fallbackMap: Record<string, number> = {
            // OpenAI
            'gpt-4o': 128000,
            'gpt-4-turbo': 128000,
            'gpt-4': 8192,
            'gpt-3.5-turbo': 16385,
            'o1-preview': 128000,
            'o1-mini': 128000,
            // Anthropic
            'claude-3-5-sonnet': 200000,
            'claude-3-opus': 200000,
            'claude-3-haiku': 200000,
            // xAI
            'grok-beta': 128000,
            'grok-2': 128000,
            'grok-4': 256000,
            // Z.ai (GLM)
            'glm-4': 128000,
            'glm-4-plus': 128000, 
            'glm-4-flash': 200000,
            'glm-4-long': 1000000,
            'glm-4-air': 128000,
        };

        // Fuzzy match on fallback keys
        for (const [key, value] of Object.entries(fallbackMap)) {
            if (modelId.includes(key)) return value;
        }

        return 4096; // Safe default
    }
}
