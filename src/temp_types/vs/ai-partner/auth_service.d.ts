import * as vscode from 'vscode';
import { ConfigService } from './config_service';
/**
 * Manages authentication, which is now solely based on API keys.
 */
export declare class AuthService {
    private static instance;
    private configService;
    private constructor();
    static getInstance(configService?: ConfigService): AuthService;
    /**
     * Checks if the user is considered "logged in" by having a valid API key.
     * @returns A promise that resolves to true if an API key is configured.
     */
    isLoggedIn(): Promise<boolean>;
    /**
     * Returns a mock account object if an API key is set.
     * This provides a consistent interface for the rest of the application.
     * @returns A promise that resolves to a mock account object or undefined.
     */
    getAccount(): Promise<vscode.AuthenticationSessionAccountInformation | undefined>;
}
