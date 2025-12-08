import * as vscode from 'vscode';
export type AuthMode = 'apiKey';
/**
 * A singleton service for managing the extension's configuration.
 */
export declare class ConfigService {
    private static instance;
    private static extensionPath;
    private static globalState;
    private secretStorage;
    private _profilesCache;
    private _activeProfileIdCache;
    private constructor();
    static initialize(context: vscode.ExtensionContext): void;
    static getInstance(): ConfigService;
    getExtensionPath(): string;
    private getConfiguration;
    getLlmProfiles(): any[];
    setLlmProfiles(profiles: any[]): Promise<void>;
    getActiveProfileId(): string | null;
    setActiveProfileId(id: string | null): Promise<void>;
    getActiveProfile(): any | null;
    saveProfile(profile: any, apiKey?: string): Promise<any>;
    deleteProfile(profileId: string): Promise<void>;
    setStreamingEnabled(enabled: boolean): Promise<void>;
    getAdvancedHistorySummaryEnabled(): boolean;
    setAdvancedHistorySummaryEnabled(enabled: boolean): Promise<void>;
    getA2AServerPort(): number;
    isStreamingEnabled(agentName?: string): boolean;
    getAlwaysConfirmExecution(): boolean;
    /**
     * Retrieves the current authentication mode.
     * @returns The current auth mode, which is always 'apiKey'.
     */
    getAuthMode(): AuthMode;
    /**
     * Saves the chosen authentication mode to the user's settings.
     * @param mode The authentication mode to save.
     */
    setAuthMode(): Promise<void>;
    getLlmProvider(): 'openai' | 'ollama' | 'anthropic' | 'xai' | 'google' | 'groq' | 'openrouter';
    setLlmProvider(provider: 'openai' | 'ollama' | 'anthropic' | 'xai' | 'google' | 'groq' | 'openrouter'): Promise<void>;
    /**
     * Retrieves the OpenAI API key from secret storage.
     */
    getOpenaiApiKeys(): Promise<string[]>;
    setOpenaiApiKeys(keys: string[]): Promise<void>;
    /**
     * Retrieves the API endpoint for the OpenAI-compatible service.
     */
    getOpenaiEndpoint(): string;
    setOpenaiEndpoint(endpoint: string): Promise<void>;
    /**
     * Retrieves the API endpoint for the Ollama service.
     */
    getOllamaIsCloud(): boolean;
    setOllamaIsCloud(isCloud: boolean): Promise<void>;
    getOllamaEndpoint(): string;
    setOllamaEndpoint(endpoint: string): Promise<void>;
    /**
     * Retrieves the API key for the Ollama service.
     */
    getOllamaApiKey(): Promise<string>;
    setOllamaApiKey(key: string): Promise<void>;
    getAnthropicApiKey(): string;
    setAnthropicApiKey(key: string): Promise<void>;
    getAnthropicEndpoint(): string;
    setAnthropicEndpoint(endpoint: string): Promise<void>;
    getXaiApiKey(): string;
    setXaiApiKey(key: string): Promise<void>;
    getXaiEndpoint(): string;
    setXaiEndpoint(endpoint: string): Promise<void>;
    getGoogleApiKey(): string;
    setGoogleApiKey(key: string): Promise<void>;
    getGoogleEndpoint(): string;
    setGoogleEndpoint(endpoint: string): Promise<void>;
    getGroqApiKey(): string;
    setGroqApiKey(key: string): Promise<void>;
    getGroqEndpoint(): string;
    setGroqEndpoint(endpoint: string): Promise<void>;
    getOpenrouterApiKey(): string;
    setOpenrouterApiKey(key: string): Promise<void>;
    getOpenrouterEndpoint(): string;
    setOpenrouterEndpoint(endpoint: string): Promise<void>;
    /**
     * Retrieves the API keys for the currently configured LLM provider.
     */
    getApiKeys(): Promise<string[]>;
    /**
     * Retrieves the API endpoint for the currently configured LLM provider.
     */
    getEndpoint(): string;
    /**
     * Retrieves the configured language model for the current provider.
     */
    getModel(agentName?: string): string;
    setModel(model: string): Promise<void>;
    /**
     * Retrieves the request timeout for a specific agent.
     */
    getRequestTimeout(agentName: string): number;
    getDeveloperMode(): boolean;
    getCheckpointsEnabled(): boolean;
    getContextTokenThreshold(): number;
    getWorkspacePath(): string;
}
