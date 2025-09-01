import * as vscode from 'vscode';

export type AuthMode = 'apiKey';

/**
 * A singleton service for managing the extension's configuration.
 */
export class ConfigService {
    private static instance: ConfigService;

    private constructor() { }

    public static getInstance(): ConfigService {
        if (!ConfigService.instance) {
            ConfigService.instance = new ConfigService();
        }
        return ConfigService.instance;
    }

    private getConfiguration(section: string) {
        return vscode.workspace.getConfiguration(`vibroboros.${section}`);
    }

    /**
     * Retrieves the current authentication mode.
     * @returns The current auth mode, which is always 'apiKey'.
     */
    public getAuthMode(): AuthMode {
        return 'apiKey';
    }

    /**
     * Saves the chosen authentication mode to the user's settings.
     * @param mode The authentication mode to save.
     */
    public async setAuthMode(mode: AuthMode): Promise<void> {
        // This method now only ensures the mode is set to apiKey.
        await this.getConfiguration('auth').update('mode', 'apiKey', vscode.ConfigurationTarget.Global);
    }

    /**
     * Retrieves the list of OpenAI-compatible API keys from the settings.
     */
    public getApiKeys(): string[] {
        return this.getConfiguration('llm').get<string[]>('apiKeys') || [];
    }

    /**
     * Retrieves the API endpoint for the API Key mode.
     */
    public getEndpoint(): string {
        return this.getConfiguration('llm').get<string>('endpoint') || '';
    }

    /**
     * Saves the API Key and Endpoint settings.
     * @param apiKey The API key to save.
     * @param endpoint The endpoint URL to save.
     */
    public async saveApiKeySettings(apiKey: string, endpoint: string): Promise<void> {
        const llmConfig = this.getConfiguration('llm');
        await llmConfig.update('apiKeys', [apiKey], vscode.ConfigurationTarget.Global);
        await llmConfig.update('endpoint', endpoint, vscode.ConfigurationTarget.Global);
    }

    /**
     * Retrieves the configured language model for a specific agent.
     */
    public getModel(agentName: string): string {
        return this.getConfiguration(`agent.${agentName}`).get<string>('model') || 'gpt-4';
    }

    /**
     * Retrieves the request timeout for a specific agent.
     */
    public getRequestTimeout(agentName: string): number {
        return this.getConfiguration(`agent.${agentName}`).get<number>('requestTimeout') || 60000;
    }

	public getContextTokenThreshold(): number {
		return this.getConfiguration('agent.orchestrator').get<number>('contextTokenThreshold') || 100000;
	}
}
