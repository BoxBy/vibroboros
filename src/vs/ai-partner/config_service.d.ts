export type AuthMode = 'apiKey';
/**
 * A singleton service for managing the extension's configuration.
 */
export declare class ConfigService {
    private static instance;
    private static extensionPath;
    private constructor();
    static initialize(extensionPath: string): void;
    static getInstance(): ConfigService;
    getExtensionPath(): string;
    private getConfiguration;
    getA2AServerPort(): number;
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
    /**
     * Retrieves the list of OpenAI-compatible API keys from the settings.
     */
    getApiKeys(): string[];
    /**
     * Retrieves the API endpoint for the API Key mode.
     */
    getEndpoint(): string;
    /**
     * Saves the API Key and Endpoint settings.
     * @param apiKey The API key to save.
     * @param endpoint The endpoint URL to save.
     */
    saveApiKeySettings(apiKey: string, endpoint: string): Promise<void>;
    /**
     * Retrieves the configured language model for a specific agent.
     */
    getModel(agentName: string): string;
    /**
     * Retrieves the request timeout for a specific agent.
     */
    getRequestTimeout(agentName: string): number;
    getContextTokenThreshold(): number;
}
