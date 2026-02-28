
/**
 * ModelInfo defines the capabilities and limits of a specific LLM model.
 */
export interface ModelInfo {
    /** The unique identifier of the model (e.g., 'gpt-4o', 'claude-3-5-sonnet') */
    id: string;
    /** The maximum total context tokens (input + output) the model can handle */
    maxContextTokens: number;
    /** The standard maximum output tokens the model can generate */
    maxOutputTokens: number;
    /** Some models support higher output limits (e.g., Extended Thinking, Beta Headers) */
    maxReasoningOutputTokens?: number;
    /** The provider of this model */
    provider: 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'groq' | 'xai' | 'openrouter' | 'google';
    /** Whether this model supports vision/multimodal input */
    multimodal?: boolean;
    /** Whether this model supports reasoning/thinking control */
    supportsReasoning?: boolean;
    /** The type of reasoning control supported */
    reasoningType?: 'effort' | 'budget' | 'level';
}

/**
 * STATIC_MODEL_REGISTRY acts as a fallback and primary source of truth for providers
 * that do not expose model metadata via API (e.g., OpenAI, Anthropic).
 * 
 * Research Basis: December 2025 Model Specifications
 */
export const STATIC_MODEL_REGISTRY: Record<string, ModelInfo> = {
    // ========================================================================
    // OpenAI (Providers: openai, openrouter)
    // ========================================================================
    // GPT-5.2 Series (Dec 2025 Flagship)
    'gpt-5.2': { 
        id: 'gpt-5.2', 
        maxContextTokens: 400000, 
        maxOutputTokens: 128000, 
        provider: 'openai',
        multimodal: true,
        supportsReasoning: true,
        reasoningType: 'effort'
    },
    'gpt-5.2-pro': { 
        id: 'gpt-5.2-pro', 
        maxContextTokens: 400000, 
        maxOutputTokens: 128000, 
        provider: 'openai',
        multimodal: true
    },
    'gpt-5.2-chat-latest': { // "Instant" mode
        id: 'gpt-5.2-chat-latest', 
        maxContextTokens: 128000, 
        maxOutputTokens: 16384, 
        provider: 'openai',
        multimodal: true
    },
    // GPT-4o Series
    'gpt-4o': { 
        id: 'gpt-4o', 
        maxContextTokens: 128000, 
        maxOutputTokens: 16384, 
        provider: 'openai',
        multimodal: true 
    },
    'gpt-4o-mini': { 
        id: 'gpt-4o-mini', 
        maxContextTokens: 128000, 
        maxOutputTokens: 16384, 
        provider: 'openai',
        multimodal: true 
    },
    'gpt-4-turbo': {
        id: 'gpt-4-turbo',
        maxContextTokens: 128000,
        maxOutputTokens: 4096,
        provider: 'openai',
        multimodal: true
    },
    'gpt-3.5-turbo': {
        id: 'gpt-3.5-turbo',
        maxContextTokens: 16385,
        maxOutputTokens: 4096,
        provider: 'openai',
        multimodal: false
    },
    // o-Series (Reasoning)
    'o1-preview': {
        id: 'o1-preview',
        maxContextTokens: 128000,
        maxOutputTokens: 32768,
        provider: 'openai',
        supportsReasoning: true,
        reasoningType: 'effort'
    },
    'o1-mini': {
        id: 'o1-mini',
        maxContextTokens: 128000,
        maxOutputTokens: 65536,
        provider: 'openai',
        supportsReasoning: true
    },
    'o3-pro': {
        id: 'o3-pro',
        maxContextTokens: 200000,
        maxOutputTokens: 64000, // Variable, often higher
        provider: 'openai',
        multimodal: true,
        supportsReasoning: true,
        reasoningType: 'effort'
    },
    'o4-mini': {
        id: 'o4-mini',
        maxContextTokens: 128000,
        maxOutputTokens: 32000,
        provider: 'openai'
    },

    // ========================================================================
    // Anthropic (Providers: anthropic, openrouter)
    // ========================================================================
    // Claude 4.5 Series (Fall 2025)
    'claude-4.5-opus': {
        id: 'claude-4.5-opus',
        maxContextTokens: 200000,
        maxOutputTokens: 64000,
        provider: 'anthropic',
        multimodal: true,
        supportsReasoning: true,
        reasoningType: 'budget'
    },
    'claude-4.5-sonnet': {
        id: 'claude-4.5-sonnet',
        maxContextTokens: 200000, // Can be 1M in preview
        maxOutputTokens: 64000,
        provider: 'anthropic',
        multimodal: true
    },
    'claude-4.5-haiku': {
        id: 'claude-4.5-haiku',
        maxContextTokens: 200000,
        maxOutputTokens: 64000,
        provider: 'anthropic',
        multimodal: true
    },
    // Claude 3.5 Series (Legacy but popular)
    'claude-3-5-sonnet-20241022': {
        id: 'claude-3-5-sonnet-20241022',
        maxContextTokens: 200000,
        maxOutputTokens: 8192,
        provider: 'anthropic',
        multimodal: true
    },
    'claude-3-5-sonnet-20240620': {
        id: 'claude-3-5-sonnet-20240620',
        maxContextTokens: 200000,
        maxOutputTokens: 8192,
        provider: 'anthropic',
        multimodal: true
    },

    // ========================================================================
    // Google (Providers: google)
    // Even though Google has a dynamic API, we register defaults for fallback
    // ========================================================================
    'gemini-3.0-pro': {
        id: 'gemini-3.0-pro',
        maxContextTokens: 2097152, // 2M+ context (Standard for 3.0)
        maxOutputTokens: 64000,
        provider: 'google',
        multimodal: true,
        supportsReasoning: true,
        reasoningType: 'level'
    },
    'gemini-3.0-flash': {
        id: 'gemini-3.0-flash',
        maxContextTokens: 2097152, // 2M context
        maxOutputTokens: 16384,
        provider: 'google',
        multimodal: true,
        supportsReasoning: true, // often flash supports it too in 3.0
        reasoningType: 'level'
    },
    'gemini-2.5-pro': {
        id: 'gemini-2.5-pro',
        maxContextTokens: 1000000,
        maxOutputTokens: 65536,
        provider: 'google',
        multimodal: true
    },
    'gemini-exp-1206': {
        id: 'gemini-exp-1206',
        provider: 'google',
        maxContextTokens: 2097152,
        maxOutputTokens: 8192,
        multimodal: true
    },
    'gemini-3-pro-preview': {
        id: 'gemini-3-pro-preview',
        provider: 'google',
        maxContextTokens: 2097152, // 2M Context
        maxOutputTokens: 8192,
        multimodal: true,
        supportsReasoning: true,
        reasoningType: 'level'
    },
    'gemini-2.0-flash-exp': {
        id: 'gemini-2.0-flash-exp',
        maxContextTokens: 1000000,
        maxOutputTokens: 8192,
        provider: 'google',
        multimodal: true
    },
    'gemini-1.5-pro': {
        id: 'gemini-1.5-pro',
        maxContextTokens: 2097152, // 2M context
        maxOutputTokens: 8192,
        provider: 'google',
        multimodal: true
    },
    'gemini-1.5-flash': {
        id: 'gemini-1.5-flash',
        maxContextTokens: 1048576, // 1M context
        maxOutputTokens: 8192,
        provider: 'google',
        multimodal: true
    },

    // ========================================================================
    // xAI (Providers: xai)
    // ========================================================================
    'grok-4': {
        id: 'grok-4',
        maxContextTokens: 256000,
        maxOutputTokens: 16384, // Estimate avg
        provider: 'xai'        
    },
    'grok-4-fast': {
        id: 'grok-4-fast',
        maxContextTokens: 2000000, // 2M Context
        maxOutputTokens: 32768, // Variable
        provider: 'xai',
        supportsReasoning: true,
        reasoningType: 'effort'
    },
    'grok-4-vis': {
        id: 'grok-4-vis', // Assuming vision variant ID
        maxContextTokens: 256000,
        maxOutputTokens: 16384,
        provider: 'xai',
        multimodal: true
    },
     'grok-beta': {
        id: 'grok-beta',
        maxContextTokens: 128000,
        maxOutputTokens: 4096,
        provider: 'xai',
        supportsReasoning: true,
        reasoningType: 'effort'
    },

    // ========================================================================
    // Groq (Providers: groq)
    // Support mostly Llama and open weights
    // ========================================================================
    'llama-3.3-70b-versatile': {
        id: 'llama-3.3-70b-versatile',
        maxContextTokens: 131072,
        maxOutputTokens: 32768,
        provider: 'groq'
    },
    'llama-3.1-8b-instant': {
        id: 'llama-3.1-8b-instant',
        maxContextTokens: 131072,
        maxOutputTokens: 8192,
        provider: 'groq'
    },
    // New Qwen/DeepSeek models on Groq
    'qwen-3-32b': {
        id: 'qwen-3-32b',
        maxContextTokens: 128000,
        maxOutputTokens: 8192,
        provider: 'groq'
    },
    // Llama 4 Series (Groq / Meta)
    'llama-4-405b-instruct': {
        id: 'llama-4-405b-instruct',
        maxContextTokens: 524288, // 512k
        maxOutputTokens: 32768,
        provider: 'groq',
        supportsReasoning: true,
        reasoningType: 'effort'
    },
    'llama-4-70b-fast': {
        id: 'llama-4-70b-fast',
        maxContextTokens: 524288,
        maxOutputTokens: 8192,
        provider: 'groq'
    },
    'llama-4-8b-instant': {
        id: 'llama-4-8b-instant',
        maxContextTokens: 256000,
        maxOutputTokens: 8192,
        provider: 'groq'
    },

    // ========================================================================
    // Ollama (Providers: ollama)
    // Local / Open Weights
    // ========================================================================
    'llama4': {
        id: 'llama4',
        maxContextTokens: 131072, // Default base
        maxOutputTokens: 4096,
        provider: 'ollama'
    },
    'llama4:70b': {
        id: 'llama4:70b',
        maxContextTokens: 131072,
        maxOutputTokens: 4096,
        provider: 'ollama'
    },
    'phi4': {
        id: 'phi4',
        maxContextTokens: 128000,
        maxOutputTokens: 4096,
        provider: 'ollama',
        supportsReasoning: true
    },
    'mistral-large-2': {
        id: 'mistral-large-2',
        maxContextTokens: 128000,
        maxOutputTokens: 32000,
        provider: 'ollama'
    },
    'gemma-3-27b': {
        id: 'gemma-3-27b',
        maxContextTokens: 8192,
        maxOutputTokens: 8192,
        provider: 'ollama'
    },

    // ========================================================================
    // OpenRouter (Providers: openrouter)
    // Specialized models not covered by primary providers
    // ========================================================================
    'nous-hermes-3-405b': {
        id: 'nous-hermes-3-405b',
        maxContextTokens: 128000,
        maxOutputTokens: 4096,
        provider: 'openrouter'
    },
    'wizardlm-3-8x22b': {
        id: 'wizardlm-3-8x22b',
        maxContextTokens: 65536,
        maxOutputTokens: 4096,
        provider: 'openrouter'
    },
    'deepseek-v3-chat': {
        id: 'deepseek-v3-chat',
        maxContextTokens: 128000,
        maxOutputTokens: 4096,
        provider: 'openrouter'
    }
};

/**
 * Returns the default limits for unknown models or providers.
 * Safe, conservative defaults.
 */
export const DEFAULT_MODEL_INFO: ModelInfo = {
    id: 'unknown',
    maxContextTokens: 8192,
    maxOutputTokens: 4096,
    provider: 'openai'
};
