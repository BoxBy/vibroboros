
import * as vscode from 'vscode';
import { SecretStorageService } from './secret_storage_service';

export type AuthMode = 'apiKey';

/**
 * A singleton service for managing the extension's configuration.
 */
export class ConfigService {
    private static instance: ConfigService;
    private static extensionPath: string;
    private static globalState: vscode.Memento;
    private secretStorage: SecretStorageService;
    // Profiles cache to reduce frequent settings reads
    private _profilesCache: any[] | null = null;
    private _activeProfileIdCache: string | null = null;
    // API Keys cache to avoid frequent SecretStorage IPC calls
    private _apiKeysCache: Map<string, string> = new Map();

    private constructor() {
        this.secretStorage = SecretStorageService.getInstance();
    }

    public static initialize(context: vscode.ExtensionContext): void {
        ConfigService.extensionPath = context.extensionPath;
        ConfigService.globalState = context.globalState;
    }

    public static getInstance(): ConfigService {
        if (!ConfigService.instance) {
            ConfigService.instance = new ConfigService();
        }
        return ConfigService.instance;
    }

    public clearApiKeyCache(): void {
        this._apiKeysCache.clear();
        console.log('[ConfigService] API Key cache cleared.');
    }

    public getExtensionPath(): string {
        return ConfigService.extensionPath;
    }

    private getConfiguration(section: string) {
        return vscode.workspace.getConfiguration(`viper.${section}`);
    }

    // -------- LLM Profiles --------
    public getLlmProfiles(): any[] {
        if (this._profilesCache) { return this._profilesCache; }
        const profiles = (ConfigService.globalState?.get<any[]>('viper.llm.profiles')) || [];
        this._profilesCache = profiles;
        return profiles;
    }

    public async setLlmProfiles(profiles: any[]): Promise<void> {
        this._profilesCache = profiles;
        await ConfigService.globalState?.update('viper.llm.profiles', profiles);
    }

    public getActiveProfileId(): string | null {
        if (this._activeProfileIdCache !== null) { return this._activeProfileIdCache; }
        const id = (ConfigService.globalState?.get<string>('viper.llm.activeProfileId')) || '';
        this._activeProfileIdCache = id || null;
        return this._activeProfileIdCache;
    }

    public async setActiveProfileId(id: string | null): Promise<void> {
        this._activeProfileIdCache = id;
        await ConfigService.globalState?.update('viper.llm.activeProfileId', id || '');
    }

    public getActiveProfile(): any | null {
        const id = this.getActiveProfileId();
        if (!id) { return null; }
        const profiles = this.getLlmProfiles();
        return profiles.find(p => p.id === id) || null;
    }

    public async saveProfile(profile: any, apiKey?: string): Promise<any> {
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
        this.clearApiKeyCache();
        return profile;
    }

    public async deleteProfile(profileId: string): Promise<void> {
        const profiles = this.getLlmProfiles().filter(p => p.id !== profileId);
        await this.setLlmProfiles(profiles);
        await this.secretStorage.deleteProfileApiKey(profileId);
        if (this.getActiveProfileId() === profileId) {
            await this.setActiveProfileId(null);
        }
        this.clearApiKeyCache();
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


    public getLlmProvider(): 'openai' | 'ollama' | 'anthropic' | 'xai' | 'google' | 'groq' | 'openrouter' {
        const active = this.getActiveProfile();
        if (active && active.provider) {
            return active.provider;
        }
        return this.getConfiguration('llm').get<'openai' | 'ollama' | 'anthropic' | 'xai' | 'google' | 'groq' | 'openrouter'>('provider') || 'openai';
    }

    public async setLlmProvider(provider: 'openai' | 'ollama' | 'anthropic' | 'xai' | 'google' | 'groq' | 'openrouter'): Promise<void> {
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
            this.clearApiKeyCache();
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

    /**
     * Retrieves the API keys for the currently configured LLM provider.
     */
    /**
     * Retrieves the API keys for the currently configured LLM provider.
     */
    public async getApiKeys(): Promise<string[]> {
        const active = this.getActiveProfile();
        if (active && active.id) {
            // Check Cache first
            if (this._apiKeysCache.has(`profile:${active.id}`)) {
                return [this._apiKeysCache.get(`profile:${active.id}`)!];
            }

            console.log(`[ConfigService] Using active profile: ${active.id} (${active.name})`);
            console.log(`[ConfigService] Retrieving API key for profile ${active.id} from SecretStorage...`);
            const key = await this.secretStorage.getProfileApiKey(active.id);
            console.log(`[ConfigService] Profile API key retrieved: ${key ? 'Yes' : 'No'}`);
            
            if (key) {
                this._apiKeysCache.set(`profile:${active.id}`, key);
                return [key];
            }
            return [];
        }

        const provider = this.getLlmProvider();
        
        // Check Cache
        if (this._apiKeysCache.has(`provider:${provider}`)) {
            return [this._apiKeysCache.get(`provider:${provider}`)!];
        }

        console.log('[ConfigService] Getting API keys for provider:', provider);

        let key: string | undefined;
        try {
            switch (provider) {
                case 'openai':
                    key = await this.secretStorage.getApiKey(provider);
                    break;
                case 'ollama':
                    key = await this.getOllamaApiKey(); // Uses its own logic, but result can be cached here
                    break;
                case 'anthropic':
                case 'xai':
                case 'google':
                case 'groq':
                case 'openrouter':
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
            this._apiKeysCache.set(`provider:${provider}`, key);
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
        const modelsByProvider = (ConfigService.globalState?.get<Record<string, string>>('viper.llm.modelsByProvider')) || {};
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
        const modelsByProvider = (ConfigService.globalState?.get<Record<string, string>>('viper.llm.modelsByProvider')) || {};
        modelsByProvider[provider] = model;
        await ConfigService.globalState?.update('viper.llm.modelsByProvider', modelsByProvider);
        // Keep legacy global for backward compatibility
        await this.getConfiguration('agent').update('model', model, vscode.ConfigurationTarget.Global);
        console.log('[ConfigService] Model updated for provider:', provider, '->', model);
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
                const vscodeLang = vscode.env.language; // e.g. 'en', 'ko', 'ja', 'zh-cn'
                // Map common codes to full names if needed, or return as is if prompts handle codes.
                // Assuming prompts prefer full names for clarity.
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
                return langMap[vscodeLang] || vscodeLang;
            }
            return this.getConfiguration('agent.orchestrator').get<string>('thinkingLanguage') || 'Korean';
        }

        public async setThinkingLanguage(lang: string): Promise<void> {
            await this.getConfiguration('agent.orchestrator').update('thinkingLanguage', lang, vscode.ConfigurationTarget.Global);
        }

        public getUseVSCodeThinkingLang(): boolean {
            return this.getConfiguration('agent.orchestrator').get<boolean>('useVSCodeThinkingLang') || false;
        }

        public async setUseVSCodeThinkingLang(use: boolean): Promise<void> {
            await this.getConfiguration('agent.orchestrator').update('useVSCodeThinkingLang', use, vscode.ConfigurationTarget.Global);
        }

        public getMaxContextOverride(): number | undefined {
            return this.getConfiguration('llm').get<number>('maxContextOverride');
        }

        public async setMaxContextOverride(limit: number | undefined): Promise<void> {
            await this.getConfiguration('llm').update('maxContextOverride', limit, vscode.ConfigurationTarget.Global);
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
	    }
