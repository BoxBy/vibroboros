
import * as vscode from 'vscode';
import { SecretStorageService } from './secret_storage_service';
import type { IConfigService, LLMProfile, ISecretStorageService } from './di/interfaces/IConfigService';

export type AuthMode = 'apiKey';

/**
 * Configuration Service
 *
 * Manages the extension's configuration using dependency injection.
 * Previously a singleton - now properly injected through DI container.
 */
export class ConfigService implements IConfigService {
    private extensionPath: string;
    private globalState: vscode.Memento;
    private secretStorage: ISecretStorageService;

    /**
     * Constructor - uses dependency injection
     * @param context VSCode extension context
     * @param secretStorage Secret storage service (injected)
     */
    constructor(
        context: vscode.ExtensionContext,
        secretStorage?: ISecretStorageService
    ) {
        this.extensionPath = context.extensionPath;
        this.globalState = context.globalState;
        // Use injected secretStorage or fall back to singleton for backward compatibility
        this.secretStorage = secretStorage || SecretStorageService.getInstance();

        // Perform migration from old keys (vibroboros) to new keys (viper)
        this.migrateLegacyData();
    }

    /**
     * Migrate data from old keys (vibroboros) to new keys (viper)
     * This is called in the constructor during initialization
     */
    private async migrateLegacyData(): Promise<void> {
        // Migrate profiles
        const newProfiles = this.globalState?.get<LLMProfile[]>('viper.llm.profiles');
        if (!newProfiles || newProfiles.length === 0) {
            const oldProfiles = this.globalState?.get<LLMProfile[]>('vibroboros.llm.profiles');
            if (oldProfiles && oldProfiles.length > 0) {
                console.log('[ConfigService] Migrating profiles from vibroboros.llm.profiles to viper.llm.profiles');
                await this.globalState?.update('viper.llm.profiles', oldProfiles);
            }
        }

        // Migrate active profile ID
        const newActiveId = this.globalState?.get<string>('viper.llm.activeProfileId');
        if (!newActiveId) {
            const oldActiveId = this.globalState?.get<string>('vibroboros.llm.activeProfileId');
            if (oldActiveId) {
                console.log('[ConfigService] Migrating activeProfileId from vibroboros.llm.activeProfileId to viper.llm.activeProfileId');
                await this.globalState?.update('viper.llm.activeProfileId', oldActiveId);
            }
        }
    }

    /**
     * @deprecated Use dependency injection instead
     * This method is kept for backward compatibility during migration
     */
    public static initialize(context: vscode.ExtensionContext): void {
        // Deprecated - no-op, kept for backward compatibility
        console.warn('[ConfigService] initialize() is deprecated. Use DI instead.');
    }

    /**
     * @deprecated Use dependency injection instead
     * This method is kept for backward compatibility during migration
     */
    public static getInstance(): ConfigService {
        // Note: getInstance() is deprecated — prefer DI injection.
        if (!ConfigService['instance']) {
            // Try to resolve from DI container as fallback
            try {
                const { CompositionRoot, ServiceIdentifiers } = require('./di/CompositionRoot');
                if (CompositionRoot.isInitialized()) {
                    const instance = CompositionRoot.resolve<ConfigService>(ServiceIdentifiers.ConfigService);
                    if (instance) {
                        ConfigService['instance'] = instance;
                        return instance;
                    }
                }
            } catch (e) {
                console.error('[ConfigService] Failed to resolve from DI container:', e);
            }
            throw new Error('ConfigService must be obtained through DI container');
        }
        return ConfigService['instance'];
    }

    /**
     * Internal setter for the singleton instance (used by DI container)
     * @internal
     */
    public static setInstance(instance: ConfigService): void {
        ConfigService['instance'] = instance;
    }

    public getExtensionPath(): string {
        return this.extensionPath;
    }

    private getConfiguration(section: string) {
        return vscode.workspace.getConfiguration(`viper.${section}`);
    }

    // -------- LLM Profiles --------
    public getLlmProfiles(): LLMProfile[] {
        // Try new key first
        let profiles = (this.globalState?.get<LLMProfile[]>('viper.llm.profiles')) || [];

        // Migration: if empty, try old key from before rename
        if (profiles.length === 0) {
            const oldProfiles = (this.globalState?.get<LLMProfile[]>('vibroboros.llm.profiles')) || [];
            if (oldProfiles.length > 0) {
                console.log('[ConfigService] Migrating profiles from vibroboros.llm.profiles to viper.llm.profiles');
                profiles = oldProfiles;
                // Migrate to new key (async but we need sync for getter)
                this.globalState?.update('viper.llm.profiles', profiles).then(() => {
                    console.log('[ConfigService] Profile migration completed');
                }).catch(e => {
                    console.error('[ConfigService] Profile migration failed:', e);
                });
                // Migrate active profile ID too
                const oldActiveId = (this.globalState?.get<string>('vibroboros.llm.activeProfileId'));
                if (oldActiveId) {
                    this.globalState?.update('viper.llm.activeProfileId', oldActiveId);
                }
            }
        }

        return profiles;
    }

    public async setLlmProfiles(profiles: LLMProfile[]): Promise<void> {
        await this.globalState?.update('viper.llm.profiles', profiles);
    }

    public getActiveProfileId(): string | null {
        // Try new key first
        let id = (this.globalState?.get<string>('viper.llm.activeProfileId')) || '';

        // Migration: if empty, try old key
        if (!id) {
            id = (this.globalState?.get<string>('vibroboros.llm.activeProfileId')) || '';
            if (id) {
                console.log('[ConfigService] Migrating activeProfileId from vibroboros.llm.activeProfileId to viper.llm.activeProfileId');
                this.globalState?.update('viper.llm.activeProfileId', id);
            }
        }

        return id || null;
    }

    public async setActiveProfileId(id: string | null): Promise<void> {
        await this.globalState?.update('viper.llm.activeProfileId', id || '');
    }

    public getActiveProfile(): LLMProfile | null {
        const id = this.getActiveProfileId();
        if (!id) { return null; }
        const profiles = this.getLlmProfiles();
        return profiles.find(p => p.id === id) || null;
    }

    public async saveProfile(profile: LLMProfile, apiKey?: string): Promise<LLMProfile> {
        const profiles = this.getLlmProfiles();
        const idx = profiles.findIndex(p => p.id === profile.id);
        if (idx >= 0) {
            profiles[idx] = profile;
        } else {
            profiles.push(profile);
        }
        await this.setLlmProfiles(profiles);
        if (apiKey !== undefined) {
            await this.secretStorage.setProfileApiKey(profile.id, apiKey);
        }
        return profile;
    }

    public async deleteProfile(profileId: string): Promise<void> {
        const profiles = this.getLlmProfiles().filter(p => p.id !== profileId);
        await this.setLlmProfiles(profiles);
        await this.secretStorage.deleteProfileApiKey(profileId);
        if (this.getActiveProfileId() === profileId) {
            await this.setActiveProfileId(null);
        }
    }

    public async getProfileApiKey(profileId: string): Promise<string> {
        return (await this.secretStorage.getProfileApiKey(profileId)) || '';
    }

    public async setStreamingEnabled(enabled: boolean): Promise<void> {
        try {
            await this.getConfiguration('llm').update('stream.enabled', !!enabled, vscode.ConfigurationTarget.Global);
        } catch {}
    }

    // -------- History Summary Settings --------
    public getAdvancedHistorySummaryEnabled(): boolean {
        try {
            return this.getConfiguration('history').get<boolean>('advancedSummary.enabled') || false;
        } catch {
            return false;
        }
    }

    public async setAdvancedHistorySummaryEnabled(enabled: boolean): Promise<void> {
        try {
            await this.getConfiguration('history').update('advancedSummary.enabled', !!enabled, vscode.ConfigurationTarget.Global);
        } catch {}
    }

    public getA2AServerPort(): number {
        return this.getConfiguration('a2a.server').get<number>('port') || 3000;
    }

    // -------- Streaming Settings --------
    public isStreamingEnabled(agentName?: string): boolean {
        try {
            const section = this.getConfiguration('llm');
            const globalEnabled = section.get<boolean>('stream.enabled');
            const perAgent = section.get<Record<string, boolean>>('stream.agents');
            if (agentName && perAgent && Object.prototype.hasOwnProperty.call(perAgent, agentName)) {
                return !!perAgent[agentName];
            }
            return globalEnabled !== undefined ? !!globalEnabled : false;
        } catch {
            return false;
        }
    }

    public getAlwaysConfirmExecution(): boolean {
        return this.getConfiguration('execution').get<boolean>('alwaysConfirm') || false;
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
    public async setAuthMode(): Promise<void> {
        // This method now only ensures the mode is set to apiKey.
        await this.getConfiguration('auth').update('mode', 'apiKey', vscode.ConfigurationTarget.Global);
    }


    public getLlmProvider(): 'openai' | 'ollama' | 'anthropic' | 'xai' | 'google' | 'groq' | 'openrouter' | 'zai' {
        const active = this.getActiveProfile();
        if (active && active.provider) {
            return active.provider;
        }
        return this.getConfiguration('llm').get<any>('provider') || 'openai';
    }

    public getAgentModel(): string {
        return this.getConfiguration('llm').get<string>('model') || '';
    }

    public getAgentModelMaxContext(): number {
        return this.getConfiguration('llm').get<number>('modelMaxContext') || 0;
    }

    public async setLlmProvider(provider: any): Promise<void> {
        await this.getConfiguration('llm').update('provider', provider, vscode.ConfigurationTarget.Global);
    }

    /**
     * Retrieves the OpenAI API key from secret storage.
     */
    public async getOpenaiApiKeys(): Promise<string[]> {
        const key = await this.secretStorage.getApiKey('openai');
        return key ? key.split(',').map(k => k.trim()).filter(k => k.length > 0) : [];
    }

    public async setOpenaiApiKeys(keys: string[]): Promise<void> {
        await this.secretStorage.setApiKey('openai', keys.join(','));
    }

    /**
     * Retrieves the API endpoint for the OpenAI-compatible service.
     */
    public getOpenaiEndpoint(): string {
        return this.getConfiguration('openai').get<string>('endpoint') || '';
    }

    public async setOpenaiEndpoint(endpoint: string): Promise<void> {
        await this.getConfiguration('openai').update('endpoint', endpoint, vscode.ConfigurationTarget.Global);
    }

    /**
     * Retrieves the API endpoint for the Ollama service.
     */
    public getOllamaIsCloud(): boolean {
        return this.getConfiguration('ollama').get<boolean>('isCloud') || true; // Default to cloud
    }
    public async setOllamaIsCloud(isCloud: boolean): Promise<void> {
        await this.getConfiguration('ollama').update('isCloud', isCloud, vscode.ConfigurationTarget.Global);
    }

    public getOllamaEndpoint(): string {
        const isCloud = this.getOllamaIsCloud();
        const configuredEndpoint = this.getConfiguration('ollama').get<string>('endpoint');
        if (configuredEndpoint && configuredEndpoint !== (isCloud ? 'https://ollama.com' : 'http://localhost:11434')) {
            return configuredEndpoint; // 사용자 정의 엔드포인트가 있다면 반환
        }
        return isCloud ? 'https://ollama.com' : 'http://localhost:11434'; // 클라우드 여부에 따른 기본값 반환
    }

    public async setOllamaEndpoint(endpoint: string): Promise<void> {
        await this.getConfiguration('ollama').update('endpoint', endpoint, vscode.ConfigurationTarget.Global);
    }

    /**
     * Retrieves the API key for the Ollama service.
     */
    public async getOllamaApiKey(): Promise<string> {
        console.log('[ConfigService] getOllamaApiKey called');
        // Prefer SecretStorage for secrets. If an old settings value exists, migrate it into SecretStorage.
        const secret = await this.secretStorage.getApiKey('ollama');
        console.log('[ConfigService] getOllamaApiKey - secret from storage:', secret ? 'exists' : 'not found');

        if (secret && secret.length > 0) {
            console.log(`[ConfigService] getOllamaApiKey returning API key. Length: ${secret.length}. Value: ${secret.substring(0, 5)}...${secret.substring(secret.length - 5)}`); // Log first/last 5 chars
            return secret;
        }

        // Fallback: check user settings for a previously stored API key and migrate it into secret storage.
        const settingsKey = this.getConfiguration('ollama').get<string>('apiKey') || '';
        console.log('[viper][ConfigService] getOllamaApiKey - settings key:', settingsKey ? 'exists' : 'not found');

        if (settingsKey && settingsKey.trim().length > 0) {
            try {
                await this.secretStorage.setApiKey('ollama', settingsKey);
                // Clear the setting to avoid leaving secrets in plaintext settings
                await this.getConfiguration('ollama').update('apiKey', '', vscode.ConfigurationTarget.Global);
                console.log('[viper][ConfigService] getOllamaApiKey - migrated settings key to secret storage');
                console.log('[viper][ConfigService] getOllamaApiKey returning migrated API key');
                return settingsKey;
            } catch (e) {
                // If migration fails, still return the settings value so the UI can display it,
                // but prefer not to throw here to avoid breaking callers.
                console.error('[viper][ConfigService] Failed to migrate Ollama API key to SecretStorage:', e);
                console.log('[viper][ConfigService] getOllamaApiKey returning settings key (migration failed)');
                return settingsKey;
            }
        }

        console.log('[viper][ConfigService] getOllamaApiKey - no key found');
        return '';
    }

    public async setOllamaApiKey(key: string): Promise<void> {
        console.log('[viper][ConfigService] Setting Ollama API key. Key present:', !!key);
        try {
            // Store Ollama API key securely in SecretStorage
            await this.secretStorage.setApiKey('ollama', key);
            console.log('[viper][ConfigService] Ollama API key stored in SecretStorage');

            // Clear any plaintext setting to avoid duplication
            await this.getConfiguration('ollama').update('apiKey', '', vscode.ConfigurationTarget.Global);
            console.log('[viper][ConfigService] Cleared plaintext Ollama API key from settings');

            // Verify the key was stored correctly
            const storedKey = await this.getOllamaApiKey();
            console.log('[ConfigService] Verification - Ollama API key is', storedKey ? 'present' : 'missing');
                    } catch (error) {
            console.error('[ConfigService] Error setting Ollama API key:', error);
            throw error;
        }
    }

    // Anthropic
    public getAnthropicApiKey(): string {
        return this.getConfiguration('anthropic').get<string>('apiKey') || '';
    }
    public async setAnthropicApiKey(key: string): Promise<void> {
        await this.getConfiguration('anthropic').update('apiKey', key, vscode.ConfigurationTarget.Global);
    }
    public getAnthropicEndpoint(): string {
        return this.getConfiguration('anthropic').get<string>('endpoint') || 'https://api.anthropic.com/v1';
    }
    public async setAnthropicEndpoint(endpoint: string): Promise<void> {
        await this.getConfiguration('anthropic').update('endpoint', endpoint, vscode.ConfigurationTarget.Global);
    }

    // xAI
    public getXaiApiKey(): string {
        return this.getConfiguration('xai').get<string>('apiKey') || '';
    }
    public async setXaiApiKey(key: string): Promise<void> {
        await this.getConfiguration('xai').update('apiKey', key, vscode.ConfigurationTarget.Global);
    }
    public getXaiEndpoint(): string {
        return this.getConfiguration('xai').get<string>('endpoint') || 'https://api.xai.com/v1';
    }
    public async setXaiEndpoint(endpoint: string): Promise<void> {
        await this.getConfiguration('xai').update('endpoint', endpoint, vscode.ConfigurationTarget.Global);
    }

    // Google
    public getGoogleApiKey(): string {
        return this.getConfiguration('google').get<string>('apiKey') || '';
    }
    public async setGoogleApiKey(key: string): Promise<void> {
        await this.getConfiguration('google').update('apiKey', key, vscode.ConfigurationTarget.Global);
    }
    public getGoogleEndpoint(): string {
        return this.getConfiguration('google').get<string>('endpoint') || 'https://generativelanguage.googleapis.com/v1beta';
    }
    public async setGoogleEndpoint(endpoint: string): Promise<void> {
        await this.getConfiguration('google').update('endpoint', endpoint, vscode.ConfigurationTarget.Global);
    }

    // Groq
    public getGroqApiKey(): string {
        return this.getConfiguration('groq').get<string>('apiKey') || '';
    }
    public async setGroqApiKey(key: string): Promise<void> {
        await this.getConfiguration('groq').update('apiKey', key, vscode.ConfigurationTarget.Global);
    }
    public getGroqEndpoint(): string {
        return this.getConfiguration('groq').get<string>('endpoint') || 'https://api.groq.com/openai/v1';
    }
    public async setGroqEndpoint(endpoint: string): Promise<void> {
        await this.getConfiguration('groq').update('endpoint', endpoint, vscode.ConfigurationTarget.Global);
    }

    // OpenRouter
    public getOpenrouterApiKey(): string {
        return this.getConfiguration('openrouter').get<string>('apiKey') || '';
    }
    public async setOpenrouterApiKey(key: string): Promise<void> {
        await this.getConfiguration('openrouter').update('apiKey', key, vscode.ConfigurationTarget.Global);
    }
    public getOpenrouterEndpoint(): string {
        return this.getConfiguration('openrouter').get<string>('endpoint') || 'https://openrouter.ai/api/v1';
    }
    public async setOpenrouterEndpoint(endpoint: string): Promise<void> {
        await this.getConfiguration('openrouter').update('endpoint', endpoint, vscode.ConfigurationTarget.Global);
    }

    // z.ai
    public getZaiApiKey(): string {
        return this.getConfiguration('zai').get<string>('apiKey') || '';
    }
    public async setZaiApiKey(key: string): Promise<void> {
        await this.secretStorage.setApiKey('zai', key); // Store in SecretStorage for consistency, though getter reads from config for now if not using SecretStorage fully for all providers yet. 
        // Note: The getter above reads from 'apiKey' setting. 
        // If we want to strictly use SecretStorage like Ollama example, we should check SecretStorage in getter.
        // For consistency with other providers in this file (except Ollama which was migrated), I'll stick to config for getter OR update getter to try SecretStorage.
        // Given existing pattern for Anthropic/xAI/etc seems to use config directly in this snippet (e.g. `this.getConfiguration('anthropic').get<string>('apiKey')`), 
        // BUT `getApiKeys` uses `secretStorage.getApiKey(provider)`. 
        // So the `set` methods should probably update `config` if `getApiKeys` relies on `secretStorage`... wait.
        // `getApiKeys` implementation: 
        // case 'anthropic': ... key = await this.secretStorage.getApiKey(provider);
        // So `getAnthropicApiKey` returning from config seems inconsistent with `getApiKeys` using secretStorage?
        // Ah, `getAnthropicApiKey` might be used for UI population.
        // Let's follow the pattern: Set to secret storage AND update config (or leave config empty).
        // For simple implementation and consistency with `getApiKeys` case 'zai':
        await this.getConfiguration('zai').update('apiKey', key, vscode.ConfigurationTarget.Global);
        await this.secretStorage.setApiKey('zai', key); 
    }
    public getZaiEndpoint(): string {
        return this.getConfiguration('zai').get<string>('endpoint') || 'https://api.z.ai/api/paas/v4';
    }
    public async setZaiEndpoint(endpoint: string): Promise<void> {
        await this.getConfiguration('zai').update('endpoint', endpoint, vscode.ConfigurationTarget.Global);
    }
    public getZaiIsCodingPlan(): boolean {
        return this.getConfiguration('zai').get<boolean>('isCodingPlan') || false;
    }
    public async setZaiIsCodingPlan(isCodingPlan: boolean): Promise<void> {
        await this.getConfiguration('zai').update('isCodingPlan', isCodingPlan, vscode.ConfigurationTarget.Global);
    }

    public async getGoogleSearchApiKey(): Promise<string> {
        return (await this.secretStorage.getApiKey('google_search_api_key')) || '';
    }

    public async setGoogleSearchApiKey(key: string): Promise<void> {
        await this.secretStorage.setApiKey('google_search_api_key', key);
            }

    public async getGoogleSearchEngineId(): Promise<string> {
        return (await this.secretStorage.getApiKey('google_search_cx')) || '';
    }

    public async setGoogleSearchEngineId(id: string): Promise<void> {
        await this.secretStorage.setApiKey('google_search_cx', id);
            }

    public async getTavilyApiKey(): Promise<string> {
        return (await this.secretStorage.getApiKey('tavily_api_key')) || '';
    }

    public async setTavilyApiKey(key: string): Promise<void> {
        await this.secretStorage.setApiKey('tavily_api_key', key);
            }

    // ========================================================================
    // Web Search Settings (unified)
    // ========================================================================
    public getWebSearchProvider(): string {
        return this.context.globalState.get('webSearch.provider') || 'tavily';
    }

    public async setWebSearchProvider(provider: string): Promise<void> {
        await this.context.globalState.update('webSearch.provider', provider);
    }

    public async getWebSearchApiKey(): Promise<string> {
        const provider = this.getWebSearchProvider();
        switch (provider) {
            case 'tavily':
                return (await this.secretStorage.getApiKey('tavily_api_key')) || '';
            case 'google':
                return (await this.secretStorage.getApiKey('google_search_api_key')) || '';
            case 'brave':
                return (await this.secretStorage.getApiKey('brave_api_key')) || '';
            default:
                return '';
        }
    }

    public async setWebSearchApiKey(key: string): Promise<void> {
        const provider = this.getWebSearchProvider();
        switch (provider) {
            case 'tavily':
                await this.secretStorage.setApiKey('tavily_api_key', key);
                break;
            case 'google':
                await this.secretStorage.setApiKey('google_search_api_key', key);
                break;
            case 'brave':
                await this.secretStorage.setApiKey('brave_api_key', key);
                break;
        }
            }

    public getWebSearchEndpoint(): string {
        const provider = this.getWebSearchProvider();
        switch (provider) {
            case 'tavily':
                return 'https://api.tavily.com';
            case 'google':
                return 'https://www.googleapis.com/customsearch/v1';
            case 'brave':
                return 'https://api.search.brave.com';
            default:
                return '';
        }
    }

    public async setWebSearchEndpoint(endpoint: string): Promise<void> {
        await this.context.globalState.update('webSearch.endpoint', endpoint);
    }

    // Reranker Settings moved to section below (lines 863+)

    /**
     * Set the topN parameter for reranking
     */
    public async setRerankerTopN(topN: number): Promise<void> {
        await this.getConfiguration('reranker').update('topN', topN, vscode.ConfigurationTarget.Global);
    }

    /**
     * Retrieves the API keys for the currently configured LLM provider.
     */
    public async getApiKeys(): Promise<string[]> {
        const active = this.getActiveProfile();
        if (active && active.id) {
            console.log(`[ConfigService] Using active profile: ${active.id} (${active.name})`);
            console.log(`[ConfigService] Retrieving API key for profile ${active.id} from SecretStorage...`);
            const key = await this.secretStorage.getProfileApiKey(active.id);
            console.log(`[ConfigService] Profile API key retrieved: ${key ? 'Yes' : 'No'}`);

            if (key) {
                return [key];
            }
            return [];
        }

        const provider = this.getLlmProvider();

        console.log('[ConfigService] Getting API keys for provider:', provider);

        let key: string | undefined;
        try {
            switch (provider) {
                case 'openai':
                    key = await this.secretStorage.getApiKey(provider);
                    break;
                case 'ollama':
                    key = await this.getOllamaApiKey();
                    break;
                case 'anthropic':
                case 'xai':
                case 'google':
                case 'groq':
                case 'openrouter':
                case 'zai':
                    key = await this.secretStorage.getApiKey(provider);
                    break;
                default:
                    return [];
            }
        } catch (err) {
            console.error('[ConfigService] Failed to retrieve API key:', err);
            return [];
        }

        if (key) {
            // OpenAI keys can be comma-separated
            if (provider === 'openai') {
                return key.split(',').map(k => k.trim()).filter(k => k.length > 0);
            }
            return [key];
        }

        return [];
    }



    /**
     * Retrieves the API endpoint for the currently configured LLM provider.
     */
    public getEndpoint(): string {
        const active = this.getActiveProfile();
        if (active && typeof active.endpoint === 'string' && active.endpoint.length > 0) {
            return active.endpoint;
        }
        const provider = this.getLlmProvider();
        switch (provider) {
            case 'ollama':
                return this.getOllamaEndpoint();
            case 'anthropic':
                return this.getAnthropicEndpoint();
            case 'xai':
                return this.getXaiEndpoint();
            case 'google':
                return this.getGoogleEndpoint();
            case 'groq':
                return this.getGroqEndpoint();
            case 'openrouter':
                return this.getOpenrouterEndpoint();
            case 'zai':
                return this.getZaiEndpoint();
            case 'openai':
            default:
                return this.getOpenaiEndpoint();
        }
    }

    /**
     * Retrieves the configured language model for the current provider.
     */
    public getModel(_agentName?: string): string {
        const active = this.getActiveProfile();
        if (active && typeof active.model === 'string' && active.model.length > 0) {
            return active.model;
        }
        const provider = this.getLlmProvider();
        console.log('[ConfigService] Getting model for provider:', provider);

        // Per-provider remembered model when not using profiles
        const modelsByProvider = (this.globalState?.get<Record<string, string>>('viper.llm.modelsByProvider')) || {};
        const remembered = modelsByProvider[provider];

        // Legacy global configured model
        const configuredModel = this.getConfiguration('agent').get<string>('model');

        // Default model per provider as last fallback
        let defaultModel;
        switch (provider) {
            case 'ollama':
                defaultModel = 'deepseek-coder:latest';
                break;
            case 'openai':
                defaultModel = 'gpt-4';
                break;
            case 'anthropic':
                defaultModel = 'claude-3-opus-20240229';
                break;
            case 'zai':
                defaultModel = 'glm-4-plus';
                break;
            default:
                defaultModel = 'gpt-4';
        }

        const finalModel = remembered || configuredModel || defaultModel;
        console.log('[ConfigService] Using model:', finalModel, 'for provider:', provider);
        return finalModel;
    }

    public async setModel(model: string): Promise<void> {
        const active = this.getActiveProfile();
        if (active) {
            const profiles = this.getLlmProfiles();
            const idx = profiles.findIndex(p => p.id === active.id);
            if (idx >= 0) {
                profiles[idx] = { ...profiles[idx], model };
                await this.setLlmProfiles(profiles);
                console.log('[ConfigService] Active profile model updated');
                return;
            }
        }
        const provider = this.getLlmProvider();
        const modelsByProvider = (this.globalState?.get<Record<string, string>>('viper.llm.modelsByProvider')) || {};
        modelsByProvider[provider] = model;
        await this.globalState?.update('viper.llm.modelsByProvider', modelsByProvider);
        // Keep legacy global for backward compatibility
        await this.getConfiguration('agent').update('model', model, vscode.ConfigurationTarget.Global);
        console.log('[ConfigService] Model updated for provider:', provider, '->', model);
    }

    public async setModelMaxContext(maxContext: number): Promise<void> {
        await this.getConfiguration('llm').update('modelMaxContext', maxContext, vscode.ConfigurationTarget.Global);
        console.log('[ConfigService] Model max context updated:', maxContext);
    }

    /**
     * Retrieves the request timeout for a specific agent.
     */
    public getRequestTimeout(agentName: string): number {
        return this.getConfiguration(`agent.${agentName}`).get<number>('requestTimeout') || 60000;
    }

    public getPrompt(agentName: string): string {
        return this.getConfiguration(`agent.${agentName}`).get<string>('customPrompt') || '';
    }

    public getDeveloperMode(): boolean {
        return vscode.workspace.getConfiguration('viper').get<boolean>('developerMode') || false;
    }

    public getCheckpointsEnabled(): boolean {
        try {
            return this.getConfiguration('checkpoints').get<boolean>('enabled') || false;
        } catch {
            return false;
        }
    }

        public getContextTokenThreshold(): number {
    		return this.getConfiguration('agent.orchestrator').get<number>('contextTokenThreshold') || 100000;
    	}

        public async setContextTokenThreshold(limit: number): Promise<void> {
            await this.getConfiguration('agent.orchestrator').update('contextTokenThreshold', limit, vscode.ConfigurationTarget.Global);
        }

        public getSummarizeTokenLimit(): number {
            // Default to 1.0 (Full usage of context if not restricted), but user formula has 0.7 hardcoded too.
            // If user meant "Ratio of Max Context dedicated to Summarization", e.g. 0.5
            return this.getConfiguration('agent.contextManagement').get<number>('summarizeTokenLimit') || 0.75; 
        }

        public async setSummarizeTokenLimit(limit: number): Promise<void> {
            await this.getConfiguration('agent.contextManagement').update('summarizeTokenLimit', limit, vscode.ConfigurationTarget.Global);
        }

        public getThinkingLanguage(): string {
            const useSync = this.getUseVSCodeThinkingLang();
            if (useSync) {
                return this.mapLanguageCode(vscode.env.language);
            }
            return this.getConfiguration('agent.orchestrator').get<string>('thinkingLanguage') || 'English';
        }

        public async setThinkingLanguage(lang: string): Promise<void> {
            await this.getConfiguration('agent.orchestrator').update('thinkingLanguage', lang, vscode.ConfigurationTarget.Global);
        }

        public getUserLanguage(): string {
            const useSync = this.getUseVSCodeUserLang();
            if (useSync) {
                return this.mapLanguageCode(vscode.env.language);
            }
            return this.getConfiguration('agent.orchestrator').get<string>('userLanguage') || 'English';
        }

        public async setUserLanguage(lang: string): Promise<void> {
            await this.getConfiguration('agent.orchestrator').update('userLanguage', lang, vscode.ConfigurationTarget.Global);
        }

        public getUseVSCodeThinkingLang(): boolean {
            return this.getConfiguration('agent.orchestrator').get<boolean>('useVSCodeThinkingLang') || false;
        }

        public async setUseVSCodeThinkingLang(use: boolean): Promise<void> {
            await this.getConfiguration('agent.orchestrator').update('useVSCodeThinkingLang', use, vscode.ConfigurationTarget.Global);
        }

        public getUseVSCodeUserLang(): boolean {
            return this.getConfiguration('agent.orchestrator').get<boolean>('useVSCodeUserLang') || false;
        }

        public async setUseVSCodeUserLang(use: boolean): Promise<void> {
            await this.getConfiguration('agent.orchestrator').update('useVSCodeUserLang', use, vscode.ConfigurationTarget.Global);
        }

        private mapLanguageCode(vscodeLang: string): string {
            const langMap: Record<string, string> = {
                'ko': 'Korean',
                'en': 'English',
                'ja': 'Japanese',
                'zh-cn': 'Chinese (Simplified)',
                'zh-tw': 'Chinese (Traditional)',
                'es': 'Spanish',
                'fr': 'French',
                'de': 'German',
                'it': 'Italian',
                'pt-br': 'Portuguese (Brazil)',
                'ru': 'Russian'
            };
            const short = vscodeLang.toLowerCase().split('-')[0];
            return langMap[vscodeLang.toLowerCase()] || langMap[short] || vscodeLang;
        }

        public getMaxContextOverride(): number | undefined {
            const val = this.getConfiguration('llm').get<number>('maxContextOverride');
            return (val === 0) ? undefined : val;
        }

        public async setMaxContextOverride(limit: number | undefined): Promise<void> {
            await this.getConfiguration('llm').update('maxContextOverride', limit, vscode.ConfigurationTarget.Global);
        }

        public getUroborosMode(): boolean {
            return this.getConfiguration('agent.orchestrator').get<boolean>('uroborosMode') || true;
        }

        public async setUroborosMode(enabled: boolean): Promise<void> {
            await this.getConfiguration('agent.orchestrator').update('uroborosMode', enabled, vscode.ConfigurationTarget.Global);
        }

        // ========================================================================
        // Batch Tool Execution Settings
        // ========================================================================

        /**
         * Enable batch tool execution - run multiple tool calls in a single LLM response
         * 장점: 비용 절감, Latency 감소
         * 단점: 도구 의존성 처리 복잡, 실패 처리 어려움
         */
        public getBatchToolExecutionEnabled(): boolean {
            return this.getConfiguration('agent.orchestrator').get<boolean>('batchToolExecution') || false;
        }

        public async setBatchToolExecutionEnabled(enabled: boolean): Promise<void> {
            await this.getConfiguration('agent.orchestrator').update('batchToolExecution', enabled, vscode.ConfigurationTarget.Global);
        }

        /**
         * Maximum number of tools to execute in a batch (when batch mode is enabled)
         */
        public getMaxBatchSize(): number {
            return this.getConfiguration('agent.orchestrator').get<number>('maxBatchSize') || 3;
        }

        public async setMaxBatchSize(size: number): Promise<void> {
            await this.getConfiguration('agent.orchestrator').update('maxBatchSize', size, vscode.ConfigurationTarget.Global);
        }

        // ========================================================================
        // Routing Safety Limits
        // ========================================================================

        /**
         * Maximum routing depth to prevent infinite loops
         */
        public getMaxRoutingDepth(): number {
            return this.getConfiguration('agent.orchestrator').get<number>('maxRoutingDepth') || 5;
        }

        public async setMaxRoutingDepth(depth: number): Promise<void> {
            await this.getConfiguration('agent.orchestrator').update('maxRoutingDepth', depth, vscode.ConfigurationTarget.Global);
        }

        /**
         * Maximum number of agent handoffs in a single session
         */
        public getMaxAgentHandoffs(): number {
            return this.getConfiguration('agent.orchestrator').get<number>('maxAgentHandoffs') || 10;
        }

        public async setMaxAgentHandoffs(count: number): Promise<void> {
            await this.getConfiguration('agent.orchestrator').update('maxAgentHandoffs', count, vscode.ConfigurationTarget.Global);
        }

        /**
         * Maximum consecutive tool calls of the same type to prevent infinite loops
         */
        public getMaxToolCallLoop(): number {
            return this.getConfiguration('agent.orchestrator').get<number>('maxToolCallLoop') || 3;
        }

        public async setMaxToolCallLoop(count: number): Promise<void> {
            await this.getConfiguration('agent.orchestrator').update('maxToolCallLoop', count, vscode.ConfigurationTarget.Global);
        }

        public getWorkspacePath(): string {
	            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
	                return vscode.workspace.workspaceFolders[0].uri.fsPath;
	            }
	            return ''; // 또는 적절한 오류 처리
	        }

	        /**
	         * Returns the list of internal Viper agents for Per-Agent LLM Override configuration.
	         */
	        public getInternalAgents(): Array<{ name: string; description: string }> {
	            return [
	                { name: 'OrchestratorAgent', description: 'Main orchestration agent' },
	                { name: 'CodeEditAgent', description: 'Coding & Implementation' },
	                { name: 'TaskDecompositionAgent', description: 'Task Breakdown' },
	                { name: 'BrainstormAgent', description: 'Planning & Architecture' },
	                { name: 'TestGenerationAgent', description: 'Testing' },
	                { name: 'DocumentationGenerationAgent', description: 'Documentation' },
	                { name: 'BugFixAgent', description: 'Deep Debugging & Root Cause' },
	                { name: 'ReadmeGenerationAgent', description: 'README Management' },
	                { name: 'ContextManagementAgent', description: 'Context Optimization' }
	            ];
	        }

	    // -------- Embedding Settings --------
	    public getEmbeddingProvider(): any {
	        return this.getConfiguration('embedding').get<any>('provider') || 'openai';
	    }

	    public async setEmbeddingProvider(provider: any): Promise<void> {
	        await this.getConfiguration('embedding').update('provider', provider, vscode.ConfigurationTarget.Global);
	    }

	    public getEmbeddingModel(): string {
	        return this.getConfiguration('embedding').get<string>('model') || 'text-embedding-3-small';
	    }

	    public async setEmbeddingModel(model: string): Promise<void> {
	        await this.getConfiguration('embedding').update('model', model, vscode.ConfigurationTarget.Global);
	    }

	    public getEmbeddingEndpoint(): string {
	        return this.getConfiguration('embedding').get<string>('endpoint') || '';
	    }

	    public async setEmbeddingEndpoint(endpoint: string): Promise<void> {
	        await this.getConfiguration('embedding').update('endpoint', endpoint, vscode.ConfigurationTarget.Global);
	    }

	    public async getEmbeddingApiKey(): Promise<string> {
	        return (await this.secretStorage.getApiKey('embedding')) || '';
	    }

	    public async setEmbeddingApiKey(key: string): Promise<void> {
	        await this.secretStorage.setApiKey('embedding', key);
	        	    }

	    public getEmbeddingDimensions(): number | undefined {
	        return this.getConfiguration('embedding').get<number>('dimensions');
	    }

	    public async setEmbeddingDimensions(dimensions: number | undefined): Promise<void> {
	        await this.getConfiguration('embedding').update('dimensions', dimensions, vscode.ConfigurationTarget.Global);
	    }

	    // -------- Reranker Settings --------
	    public getRerankerProvider(): any {
	        return this.getConfiguration('reranker').get<any>('provider') || 'none';
	    }

	    public async setRerankerProvider(provider: any): Promise<void> {
	        await this.getConfiguration('reranker').update('provider', provider, vscode.ConfigurationTarget.Global);
	    }

	    public getRerankerModel(): string {
	        return this.getConfiguration('reranker').get<string>('model') || 'rerank-english-v3.0';
	    }

	    public async setRerankerModel(model: string): Promise<void> {
	        await this.getConfiguration('reranker').update('model', model, vscode.ConfigurationTarget.Global);
	    }

	    public async getRerankerApiKey(): Promise<string> {
	        return (await this.secretStorage.getApiKey('reranker')) || '';
	    }

	    public async setRerankerApiKey(key: string): Promise<void> {
	        await this.secretStorage.setApiKey('reranker', key);
	        	    }

	    public getRerankerEndpoint(): string {
	        return this.getConfiguration('reranker').get<string>('endpoint') || '';
	    }

	    public async setRerankerEndpoint(endpoint: string): Promise<void> {
	        await this.getConfiguration('reranker').update('endpoint', endpoint, vscode.ConfigurationTarget.Global);
	    }

	    public getRerankerTopK(): number {
	        return this.getConfiguration('reranker').get<number>('topK') || 10;
	    }

	    public async setRerankerTopK(topK: number): Promise<void> {
	        await this.getConfiguration('reranker').update('topK', topK, vscode.ConfigurationTarget.Global);
	    }

    // -------- Search Mode Settings --------
    /**
     * Search mode preference
     * - 'auto': Use embedding if API key is available, otherwise use BM25
     * - 'embedding': Always use embedding (semantic search)
     * - 'bm25': Always use BM25 (keyword search, no embedding API required)
     */
    public getSearchMode(): any {
        return this.getConfiguration('search').get<any>('mode') || 'auto';
    }

    public async setSearchMode(mode: any): Promise<void> {
        await this.getConfiguration('search').update('mode', mode, vscode.ConfigurationTarget.Global);
    }

    /**
     * Get the effective search mode (resolves 'auto' based on embedding API availability)
     */
    public async getEffectiveSearchMode(): Promise<any> {
        const mode = this.getSearchMode();

        if (mode === 'auto') {
            // Check if embedding API is available
            const apiKey = await this.getEmbeddingApiKey();
            const hasEmbedding = !!apiKey && apiKey.length > 0;

            return hasEmbedding ? 'embedding' : 'bm25';
        }

        return mode;
    }
}
