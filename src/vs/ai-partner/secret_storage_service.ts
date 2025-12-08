import * as vscode from 'vscode';

export class SecretStorageService {
    private static instance: SecretStorageService;
    private secretStorage: vscode.SecretStorage;
    private static readonly PREFIX = 'viper.';
    private static readonly PROFILE_PREFIX = 'viper.llm.profile.';

    private constructor(secretStorage: vscode.SecretStorage) {
        this.secretStorage = secretStorage;
    }

    public static initialize(context: vscode.ExtensionContext): void {
        SecretStorageService.instance = new SecretStorageService(context.secrets);
    }

    public static getInstance(): SecretStorageService {
        if (!SecretStorageService.instance) {
            throw new Error('SecretStorageService not initialized');
        }
        return SecretStorageService.instance;
    }

    private getKey(provider: string): string {
        return `${SecretStorageService.PREFIX}${provider}.apiKey`;
    }

    private getProfileKey(profileId: string): string {
        return `${SecretStorageService.PROFILE_PREFIX}${profileId}.apiKey`;
    }

    public async getApiKey(provider: string): Promise<string | undefined> {
        return this.secretStorage.get(this.getKey(provider));
    }

    public async setApiKey(provider: string, key: string): Promise<void> {
        const storageKey = this.getKey(provider);
        console.log(`[SecretStorageService] Attempting to store key for provider ${provider}. Key present: ${!!key}`);
        try {
            await this.secretStorage.store(storageKey, key);
            console.log(`[SecretStorageService] Successfully stored key for ${provider}`);
            // Verify the key was stored
            const storedKey = await this.getApiKey(provider);
            console.log(`[SecretStorageService] Verification - Key for ${provider} is ${storedKey ? 'present' : 'missing'}`);
        } catch (error) {
            console.error(`[SecretStorageService] Error storing key for ${provider}:`, error);
            throw error;
        }
    }

    public async deleteApiKey(provider: string): Promise<void> {
        await this.secretStorage.delete(this.getKey(provider));
    }

    // Profile-scoped API keys
    public async getProfileApiKey(profileId: string): Promise<string | undefined> {
        return this.secretStorage.get(this.getProfileKey(profileId));
    }

    public async setProfileApiKey(profileId: string, key: string): Promise<void> {
        const storageKey = this.getProfileKey(profileId);
        console.log(`[SecretStorageService] Storing key for profile ${profileId}. Key present: ${!!key}`);
        await this.secretStorage.store(storageKey, key);
    }

    public async deleteProfileApiKey(profileId: string): Promise<void> {
        await this.secretStorage.delete(this.getProfileKey(profileId));
    }
}