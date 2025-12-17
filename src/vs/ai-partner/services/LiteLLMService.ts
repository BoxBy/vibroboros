import fetch from 'node-fetch'; // Environment-specific, assuming node-fetch or native fetch in VS Code context
import { ModelInfo } from './LLMService';

interface LiteLLMModelInfo {
    max_tokens?: number;
    max_input_tokens?: number;
    max_output_tokens?: number;
    litellm_provider?: string;
    mode?: string;
}

export class LiteLLMService {
    // LiteLLM Official GitHub Raw URL (High Availability CDN)
    private static DB_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
    
    private static cache: Record<string, LiteLLMModelInfo> | null = null;
    private static fetchPromise: Promise<Record<string, LiteLLMModelInfo>> | null = null;

    /**
     * Fetches the latest model DB from GitHub.
     * Includes caching (singleton) and request deduping.
     */
    private static async fetchModelDB(): Promise<Record<string, LiteLLMModelInfo>> {
        if (this.cache) return this.cache;
        
        // Dedup simultaneous requests
        if (this.fetchPromise) return this.fetchPromise;

        this.fetchPromise = (async () => {
            try {
                const response = await fetch(this.DB_URL);
                if (!response.ok) throw new Error(`Status ${response.status}`);
                const data = await response.json();
                this.cache = data as Record<string, LiteLLMModelInfo>;
                console.log('[LiteLLMService] Successfully fetched DB from GitHub.');
                return this.cache;
            } catch (e) {
                console.warn("[LiteLLMService] Failed to fetch DB:", e);
                return {};
            } finally {
                this.fetchPromise = null;
            }
        })();

        return this.fetchPromise;
    }

    /**
     * Retrieves context length for a given model.
     * Returns undefined if not found.
     */
    public static async getContextLength(modelName: string): Promise<number | undefined> {
        const db = await this.fetchModelDB();
        
        // 1. Exact Match
        if (db[modelName]) {
            return this.extractMaxTokens(db[modelName]);
        }

        // 2. Loose Matching (Provider prefix handling)
        const suffixMatch = Object.keys(db).find(k => k.endsWith(`/${modelName}`) || modelName.endsWith(`/${k}`));
        if (suffixMatch && db[suffixMatch]) {
            return this.extractMaxTokens(db[suffixMatch]);
        }

        // 3. Fuzzy / Normalization Matching (for qwen3-coder:480b vs Qwen3-Coder-480B-...)
        // Normalize: lower case, replace : and _ with -
        const normalize = (s: string) => s.toLowerCase().replace(/[:_]/g, '-');
        const normInput = normalize(modelName);

        const fuzzyKey = Object.keys(db).find(k => {
            const normKey = normalize(k);
            // Check if normalized DB key contains normalized input OR vice versa
            return normKey.includes(normInput) || normInput.includes(normKey);
        });

        if (fuzzyKey && db[fuzzyKey]) {
            // console.log(`[LiteLLMService] Fuzzy match: ${modelName} -> ${fuzzyKey}`);
            return this.extractMaxTokens(db[fuzzyKey]);
        }
        
        return undefined;
    }

    private static extractMaxTokens(info: LiteLLMModelInfo): number {
        // Priority: max_input_tokens (User Input Context) -> max_tokens (Total/Output Fallback)
        if (info.max_input_tokens) return info.max_input_tokens;
        if (info.max_tokens) return info.max_tokens;
        return 4096; // Fallback if entry exists but has no token info
    }
}
