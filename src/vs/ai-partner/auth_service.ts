import * as vscode from 'vscode';
import { ConfigService } from './config_service';

const AUTH_PROVIDER_ID = 'google';
const AUTH_SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Manages authentication, respecting the user-selected authentication mode.
 * Implements a retry mechanism to handle potential timing issues with the auth provider.
 */
export class AuthService {
    private static instance: AuthService;
    private session: vscode.AuthenticationSession | undefined;
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
     * Retrieves the authentication session, retrying on failure.
     * Notifies the user with a clear error message if authentication fails after all retries.
     * @param createIfNone - If true, prompts the user to log in if no session exists.
     */
    private async getSession(createIfNone: boolean): Promise<vscode.AuthenticationSession | undefined> {
        if (this.configService.getAuthMode() !== 'google') {
            this.session = undefined;
            return undefined;
        }

        for (let i = 0; i < MAX_RETRIES; i++) {
            try {
                this.session = await vscode.authentication.getSession(AUTH_PROVIDER_ID, AUTH_SCOPES, { createIfNone });
                return this.session;
            } catch (error: any) {
                console.error(`Attempt ${i + 1}/${MAX_RETRIES} to get Google session failed:`, error);
                if (i < MAX_RETRIES - 1) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                } else {
                    vscode.window.showErrorMessage(`Failed to authenticate with Google: ${error.message}. Please try again or check the Accounts menu.`);
                    this.session = undefined;
                    return undefined;
                }
            }
        }
        return undefined;
    }

    public async login(): Promise<void> {
        if (this.configService.getAuthMode() !== 'google') {
            vscode.window.showWarningMessage("Cannot log in. Authentication mode is set to 'API Key'.");
            return;
        }
        const session = await this.getSession(true); // createIfNone = true
        if (session) {
            vscode.window.showInformationMessage(`Successfully logged in as ${session.account.label}`);
        }
    }

    public async logout(): Promise<void> {
        if (this.configService.getAuthMode() !== 'google' || !this.session) {
            return;
        }
        this.session = undefined;
        // VS Code manages the actual session logout; we just clear our state.
        vscode.window.showInformationMessage('Logged out. To fully sign out of your Google account, please use the Accounts menu in the bottom-left of VS Code.');
    }

    public async isLoggedIn(): Promise<boolean> {
        if (this.configService.getAuthMode() !== 'google') {
            return false;
        }
        const session = await this.getSession(false); // createIfNone = false
        return !!session;
    }

    public async getAccessToken(): Promise<string | undefined> {
        if (this.configService.getAuthMode() !== 'google') {
            return undefined;
        }
        const session = await this.getSession(false); // createIfNone = false
        return session?.accessToken;
    }

    public async getAccount(): Promise<vscode.AuthenticationSessionAccountInformation | undefined> {
        if (this.configService.getAuthMode() !== 'google') {
            return undefined;
        }
        const session = await this.getSession(false); // createIfNone = false
        return session?.account;
    }
}
