import * as vscode from 'vscode';

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

    private get configuration() {
        return vscode.workspace.getConfiguration('vibroboros.llm'); // Corrected configuration section
    }

    /**
     * Retrieves the list of OpenAI-compatible API keys from the settings.
     */
    public getApiKeys(): string[] {
        return this.configuration.get<string[]>('apiKeys') || [];
    }

    /**
     * Retrieves the configured language model.
     */
    public getModel(): string {
        return this.configuration.get<string>('model') || 'gpt-4';
    }
}
