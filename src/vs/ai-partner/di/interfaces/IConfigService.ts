/**
 * Interface for Config Service
 * Manages configuration settings and API keys
 */

export interface LLMProfile {
    id?: string;
    name: string;
    provider: string;
    baseURL?: string;
    endpoint?: string;
    apiKey?: string;
    model?: string;
    requestTimeout?: number;
    agentOverrides?: { [agentName: string]: string };
}

export interface IConfigService {
    // ========================================================================
    // Extension Context
    // ========================================================================
    getExtensionPath(): string;
    getWorkspacePath(): string;

    // ========================================================================
    // Language Settings
    // ========================================================================
    getUserLanguage(): string;
    getThinkingLanguage(): string;

    // ========================================================================
    // LLM Provider Settings
    // ========================================================================
    getLlmProvider(): 'openai' | 'ollama' | 'anthropic' | 'xai' | 'google' | 'groq' | 'openrouter' | 'zai';
    setLlmProvider(provider: string): Promise<void>;
    getEndpoint(): string;
    getModel(agentName?: string): string;
    setModel(model: string): Promise<void>;
    getRequestTimeout(agentName?: string): number;

    // ========================================================================
    // API Keys
    // ========================================================================
    getApiKeys(): Promise<string[]>;
    getOpenaiApiKeys(): Promise<string[]>;
    setOpenaiApiKeys(keys: string[]): Promise<void>;

    // ========================================================================
    // LLM Profiles
    // ========================================================================
    getLlmProfiles(): LLMProfile[];
    setLlmProfiles(profiles: LLMProfile[]): Promise<void>;
    getActiveProfileId(): string | null;
    setActiveProfileId(id: string | null): Promise<void>;
    getActiveProfile(): LLMProfile | null;
    saveProfile(profile: LLMProfile, apiKey?: string): Promise<LLMProfile>;
    deleteProfile(profileId: string): Promise<void>;

    // ========================================================================
    // Streaming Settings
    // ========================================================================
    isStreamingEnabled(agentName?: string): boolean;
    setStreamingEnabled(enabled: boolean): Promise<void>;

    // ========================================================================
    // Context Management Settings
    // ========================================================================
    getContextTokenThreshold(): number;
    setContextTokenThreshold(limit: number): Promise<void>;
    getSummarizeTokenLimit(): number;
    setSummarizeTokenLimit(limit: number): Promise<void>;
    getMaxContextOverride(): number | undefined;
    setMaxContextOverride(limit: number | undefined): Promise<void>;

    // ========================================================================
    // Routing Settings
    // ========================================================================
    getMaxRoutingDepth(): number;
    setMaxRoutingDepth(depth: number): Promise<void>;
    getMaxAgentHandoffs(): number;
    setMaxAgentHandoffs(count: number): Promise<void>;
    getMaxToolCallLoop(): number;
    setMaxToolCallLoop(count: number): Promise<void>;
    getBatchToolExecutionEnabled(): boolean;
    setBatchToolExecutionEnabled(enabled: boolean): Promise<void>;
    getMaxBatchSize(): number;
    setMaxBatchSize(size: number): Promise<void>;

    // ========================================================================
    // Agent Settings
    // ========================================================================
    getUroborosMode(): boolean;
    setUroborosMode(enabled: boolean): Promise<void>;
    getPrompt(agentName: string): string;
    getAgentModel(): string;
    getAgentModelMaxContext(): number;
    getInternalAgents(): Array<{ name: string; description: string }>;

    // ========================================================================
    // Search Settings
    // ========================================================================
    getSearchMode(): string;
    setSearchMode(mode: string): Promise<void>;
    getEffectiveSearchMode(): Promise<string>;

    // ========================================================================
    // Embedding Settings
    // ========================================================================
    getEmbeddingProvider(): string;
    setEmbeddingProvider(provider: string): Promise<void>;
    getEmbeddingModel(): string;
    setEmbeddingModel(model: string): Promise<void>;
    getEmbeddingEndpoint(): string;
    setEmbeddingEndpoint(endpoint: string): Promise<void>;
    getEmbeddingApiKey(): Promise<string>;
    setEmbeddingApiKey(key: string): Promise<void>;
    getEmbeddingDimensions(): number | undefined;
    setEmbeddingDimensions(dimensions: number | undefined): Promise<void>;

    // ========================================================================
    // Reranker Settings
    // ========================================================================
    getRerankerProvider(): string;
    setRerankerProvider(provider: string): Promise<void>;
    getRerankerModel(): string;
    setRerankerModel(model: string): Promise<void>;
    getRerankerApiKey(): Promise<string>;
    setRerankerApiKey(key: string): Promise<void>;
    getRerankerEndpoint(): string;
    setRerankerEndpoint(endpoint: string): Promise<void>;
    getRerankerTopK(): number;
    setRerankerTopK(topK: number): Promise<void>;
    setRerankerTopN(topN: number): Promise<void>;

    // ========================================================================
    // Web Search Settings
    // ========================================================================
    getWebSearchProvider(): string;
    setWebSearchProvider(provider: string): Promise<void>;
    getWebSearchApiKey(): Promise<string>;
    setWebSearchApiKey(key: string): Promise<void>;
    getWebSearchEndpoint(): string;
    setWebSearchEndpoint(endpoint: string): Promise<void>;

    // Legacy Google Search (deprecated, kept for compatibility)
    getGoogleSearchApiKey(): Promise<string>;
    setGoogleSearchApiKey(key: string): Promise<void>;
    getGoogleSearchEngineId(): Promise<string>;
    setGoogleSearchEngineId(id: string): Promise<void>;
    getTavilyApiKey(): Promise<string>;
    setTavilyApiKey(key: string): Promise<void>;

    // ========================================================================
    // Provider-specific Settings
    // ========================================================================
    // OpenAI
    getOpenaiEndpoint(): string;
    setOpenaiEndpoint(endpoint: string): Promise<void>;

    // Ollama
    getOllamaEndpoint(): string;
    setOllamaEndpoint(endpoint: string): Promise<void>;
    getOllamaApiKey(): Promise<string>;
    setOllamaApiKey(key: string): Promise<void>;
    getOllamaIsCloud(): boolean;
    setOllamaIsCloud(isCloud: boolean): Promise<void>;

    // Anthropic
    getAnthropicApiKey(): string;
    setAnthropicApiKey(key: string): Promise<void>;
    getAnthropicEndpoint(): string;
    setAnthropicEndpoint(endpoint: string): Promise<void>;

    // xAI
    getXaiApiKey(): string;
    setXaiApiKey(key: string): Promise<void>;
    getXaiEndpoint(): string;
    setXaiEndpoint(endpoint: string): Promise<void>;

    // Google
    getGoogleApiKey(): string;
    setGoogleApiKey(key: string): Promise<void>;
    getGoogleEndpoint(): string;
    setGoogleEndpoint(endpoint: string): Promise<void>;

    // Groq
    getGroqApiKey(): string;
    setGroqApiKey(key: string): Promise<void>;
    getGroqEndpoint(): string;
    setGroqEndpoint(endpoint: string): Promise<void>;

    // OpenRouter
    getOpenrouterApiKey(): string;
    setOpenrouterApiKey(key: string): Promise<void>;
    getOpenrouterEndpoint(): string;
    setOpenrouterEndpoint(endpoint: string): Promise<void>;

    // ZAI
    getZaiApiKey(): string;
    setZaiApiKey(key: string): Promise<void>;
    getZaiEndpoint(): string;
    setZaiEndpoint(endpoint: string): Promise<void>;
    getZaiIsCodingPlan(): boolean;
    setZaiIsCodingPlan(isCodingPlan: boolean): Promise<void>;

    // ========================================================================
    // Other Settings
    // ========================================================================
    getDeveloperMode(): boolean;
    getCheckpointsEnabled(): boolean;
    getAlwaysConfirmExecution(): boolean;
    getA2AServerPort(): number;
    getAuthMode(): string;
    setAuthMode(): Promise<void>;
    clearApiKeyCache(): void;

    // ========================================================================
    // History Settings
    // ========================================================================
    getAdvancedHistorySummaryEnabled(): boolean;
    setAdvancedHistorySummaryEnabled(enabled: boolean): Promise<void>;
}

export interface ISecretStorageService {
    get(key: string): Promise<string | undefined>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;

    // Profile-specific API key management
    getApiKey(profileId?: string): Promise<string | undefined>;
    setApiKey(apiKey: string, profileId?: string): Promise<void>;
    getProfileApiKey(profileId: string): Promise<string | undefined>;
    setProfileApiKey(profileId: string, apiKey: string): Promise<void>;
    deleteProfileApiKey(profileId: string): Promise<void>;
}
