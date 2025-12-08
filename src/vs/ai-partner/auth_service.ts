import * as vscode from 'vscode';
import { ConfigService } from './config_service';

/**
 * Manages authentication, which is now solely based on API keys.
 */
export class AuthService {
    private static instance: AuthService;
    private configService: ConfigService;

    private constructor(configService: ConfigService) {
        this.configService = configService;
    }

    public static getInstance(configService?: ConfigService): AuthService {
        if (!AuthService.instance) {
            if (!configService) {
                throw new Error("AuthService must be initialized with ConfigService.");
            }
            AuthService.instance = new AuthService(configService);
        }
        return AuthService.instance;
    }

    /**
     * Checks if the user is considered "logged in" by having a valid API key.
     * @returns A promise that resolves to true if an API key is configured.
     */
    public async isLoggedIn(): Promise<boolean> {
        const apiKeys = this.configService.getApiKeys();
        // A user is "logged in" if at least one API key is present and not an empty string.
        return apiKeys.length > 0 && !!apiKeys[0];
    }

    /**
     * Returns a mock account object if an API key is set.
     * This provides a consistent interface for the rest of the application.
     * @returns A promise that resolves to a mock account object or undefined.
     */
    public async getAccount(): Promise<vscode.AuthenticationSessionAccountInformation | undefined> {
        const loggedIn = await this.isLoggedIn();
        if (loggedIn) {
            return {
                id: 'api-key-user',
                label: 'API Key User'
            };
        }
        return undefined;
    }
}
