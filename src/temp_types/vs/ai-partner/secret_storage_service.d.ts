import * as vscode from 'vscode';
export declare class SecretStorageService {
    private static instance;
    private secretStorage;
    private static readonly PREFIX;
    private static readonly PROFILE_PREFIX;
    private constructor();
    static initialize(context: vscode.ExtensionContext): void;
    static getInstance(): SecretStorageService;
    private getKey;
    private getProfileKey;
    getApiKey(provider: string): Promise<string | undefined>;
    setApiKey(provider: string, key: string): Promise<void>;
    deleteApiKey(provider: string): Promise<void>;
    getProfileApiKey(profileId: string): Promise<string | undefined>;
    setProfileApiKey(profileId: string, key: string): Promise<void>;
    deleteProfileApiKey(profileId: string): Promise<void>;
}
