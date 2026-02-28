/**
 * UI Message Handlers - Command Pattern Implementation
 *
 * This module implements the Command Pattern for handling UI messages
 * from the webview. It replaces the large switch statement in AIPartnerViewProvider
 * with a registry of specialized handlers.
 */

import * as vscode from 'vscode';
import { ConfigService } from '../../../config_service';
import { LLMService } from '../../../services/LLMService';

// ============================================================================
// Types
// ============================================================================

/**
 * UI Message interface - represents messages from the webview
 */
export interface UIMessage {
    command: string;
    payload?: any;
    [key: string]: any;
}

/**
 * Context provided to message handlers
 */
export interface CommandHandlerContext {
    extensionUri: vscode.Uri;
    configService: ConfigService;
    llmService: LLMService;
    context: vscode.ExtensionContext;
    view?: vscode.WebviewView;
    postMessage: (message: any) => void;
}

/**
 * Message handler function type
 */
export type MessageHandler = (
    message: UIMessage,
    context: CommandHandlerContext
) => Promise<void> | void;

// ============================================================================
// Message Handler Registry
// ============================================================================

/**
 * Registry for message handlers following the Command Pattern.
 * Similar to toolRegistry in MCPServer.ts
 */
export class MessageHandlerRegistry {
    private handlers: Map<string, MessageHandler> = new Map();

    /**
     * Register a handler for a specific command
     */
    register(command: string, handler: MessageHandler): void {
        this.handlers.set(command, handler);
    }

    /**
     * Check if a handler exists for a command
     */
    hasHandler(command: string): boolean {
        return this.handlers.has(command);
    }

    /**
     * Handle a message by dispatching to the appropriate handler
     */
    async handle(message: UIMessage, context: CommandHandlerContext): Promise<void> {
        const handler = this.handlers.get(message.command);
        if (handler) {
            await handler(message, context);
        } else {
            console.warn(`[MessageHandlerRegistry] No handler for command: ${message.command}`);
        }
    }

    /**
     * Get all registered commands
     */
    getRegisteredCommands(): string[] {
        return Array.from(this.handlers.keys());
    }
}

// ============================================================================
// Handler Implementations
// ============================================================================

/**
 * Handler for settings-related commands
 */
const settingsHandlers: Record<string, MessageHandler> = {
    getLLMSettings: async (_message, context) => {
        const provider = context.configService.getLlmProvider() || 'openai';
        const apiKeys = await context.configService.getApiKeys();
        const apiKey = apiKeys?.[0] || '';

        // Get endpoint for current provider
        let endpoint = '';
        switch (provider) {
            case 'openai': endpoint = context.configService.getOpenaiEndpoint(); break;
            case 'ollama': endpoint = context.configService.getOllamaEndpoint(); break;
            case 'anthropic': endpoint = context.configService.getAnthropicEndpoint(); break;
            case 'xai': endpoint = context.configService.getXaiEndpoint(); break;
            case 'google': endpoint = context.configService.getGoogleEndpoint(); break;
            case 'groq': endpoint = context.configService.getGroqEndpoint(); break;
            case 'openrouter': endpoint = context.configService.getOpenrouterEndpoint(); break;
            case 'zai': endpoint = context.configService.getZaiEndpoint(); break;
        }

        const settings = {
            llmProvider: provider,
            model: context.configService.getModel() || '',
            endpoint: endpoint || '',
            apiKey: apiKey,
            ollamaIsCloud: context.configService.getOllamaIsCloud?.() || false,
            isCodingPlan: context.configService.getZaiIsCodingPlan?.() || false,
        };
        context.postMessage({ command: 'llmSettingsResponse', payload: settings });
    },

    // Alias for UI
    requestLlmSettings: async (_message, context) => {
        const provider = context.configService.getLlmProvider() || 'openai';
        const apiKeys = await context.configService.getApiKeys();
        const apiKey = apiKeys?.[0] || '';

        // Get endpoint for current provider
        let endpoint = '';
        switch (provider) {
            case 'openai': endpoint = context.configService.getOpenaiEndpoint(); break;
            case 'ollama': endpoint = context.configService.getOllamaEndpoint(); break;
            case 'anthropic': endpoint = context.configService.getAnthropicEndpoint(); break;
            case 'xai': endpoint = context.configService.getXaiEndpoint(); break;
            case 'google': endpoint = context.configService.getGoogleEndpoint(); break;
            case 'groq': endpoint = context.configService.getGroqEndpoint(); break;
            case 'openrouter': endpoint = context.configService.getOpenrouterEndpoint(); break;
            case 'zai': endpoint = context.configService.getZaiEndpoint(); break;
        }

        const settings = {
            llmProvider: provider,
            model: context.configService.getModel() || '',
            endpoint: endpoint || '',
            apiKey: apiKey,
            ollamaIsCloud: context.configService.getOllamaIsCloud?.() || false,
            isCodingPlan: context.configService.getZaiIsCodingPlan?.() || false,
            modelMaxContext: context.configService.getAgentModelMaxContext?.() || 0,
        };
        console.log('[SettingsHandler] requestLlmSettings:', { provider, endpoint, modelMaxContext: settings.modelMaxContext });
        context.postMessage({ command: 'llmSettingsResponse', payload: settings });
    },

    updateLLMSettings: async (message, context) => {
        const { provider, model } = message.payload || {};
        if (provider) {
            await context.configService.setLlmProvider(provider);
        }
        if (model) {
            await context.configService.setModel(model);
        }
    },

    // Alias for UI
    saveLlmSettings: async (message, context) => {
        const payload = message.payload || {};
        const provider = payload.llmProvider;

        // Provider
        if (provider) {
            await context.configService.setLlmProvider(provider);
        }

        // Model
        if (payload.model) {
            await context.configService.setModel(payload.model);
        }

        // Save endpoint for current provider
        if (payload.endpoint) {
            switch (provider) {
                case 'openai': await context.configService.setOpenaiEndpoint?.(payload.endpoint); break;
                case 'ollama': await context.configService.setOllamaEndpoint?.(payload.endpoint); break;
                case 'anthropic': await context.configService.setAnthropicEndpoint?.(payload.endpoint); break;
                case 'xai': await context.configService.setXaiEndpoint?.(payload.endpoint); break;
                case 'google': await context.configService.setGoogleEndpoint?.(payload.endpoint); break;
                case 'groq': await context.configService.setGroqEndpoint?.(payload.endpoint); break;
                case 'openrouter': await context.configService.setOpenrouterEndpoint?.(payload.endpoint); break;
                case 'zai': await context.configService.setZaiEndpoint?.(payload.endpoint); break;
            }
        }

        // Save API Key for current provider
        if (payload.apiKey !== undefined) {
            switch (provider) {
                case 'openai': await context.configService.setOpenaiApiKeys?.([payload.apiKey]); break;
                case 'ollama': await context.configService.setOllamaApiKey?.(payload.apiKey); break;
                case 'anthropic': await context.configService.setAnthropicApiKey?.(payload.apiKey); break;
                case 'xai': await context.configService.setXaiApiKey?.(payload.apiKey); break;
                case 'google': await context.configService.setGoogleApiKey?.(payload.apiKey); break;
                case 'groq': await context.configService.setGroqApiKey?.(payload.apiKey); break;
                case 'openrouter': await context.configService.setOpenrouterApiKey?.(payload.apiKey); break;
                case 'zai': await context.configService.setZaiApiKey?.(payload.apiKey); break;
            }
        }

        // Provider-specific flags
        if (provider === 'ollama' && typeof payload.ollamaIsCloud === 'boolean') {
            await context.configService.setOllamaIsCloud?.(payload.ollamaIsCloud);
        }
        if (provider === 'zai' && typeof payload.isCodingPlan === 'boolean') {
            await context.configService.setZaiIsCodingPlan?.(payload.isCodingPlan);
        }

        // Save model max context
        if (typeof payload.modelMaxContext === 'number') {
            await context.configService.setModelMaxContext?.(payload.modelMaxContext);
        }

        console.log('[SettingsHandler] saveLlmSettings saved:', { provider, endpoint: payload.endpoint, model: payload.model, modelMaxContext: payload.modelMaxContext, hasApiKey: !!payload.apiKey });
    }
};

interface ModelCacheEntry {
    models: any[];
    timestamp: number;
}
const modelsCache = new Map<string, ModelCacheEntry>();
const MODEL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Handler for model-related commands
 */
const modelHandlers: Record<string, MessageHandler> = {
    getModels: async (message, context) => {
        try {
            const provider = message.payload?.provider || context.configService.getLlmProvider() || 'openai';
            const apiKeys = await context.configService.getApiKeys();
            const apiKey = apiKeys?.[0] || '';
            const endpoint = context.configService.getEndpoint() || '';

            if (apiKey) {
                const models = await context.llmService.listModels(provider as any, apiKey, endpoint);
                context.postMessage({ command: 'updateModels', payload: models });
            } else {
                context.postMessage({ command: 'updateModels', payload: [] });
            }
        } catch (error) {
            console.error('[ModelHandler] Error fetching models:', error);
            context.postMessage({ command: 'updateModels', payload: [] });
        }
    },

    // Alias for UI
    requestModels: async (message, context) => {
        try {
            const provider = message.payload?.provider || context.configService.getLlmProvider() || 'openai';

            // Use apiKey from payload first (immediate input value), then fall back to stored keys
            let apiKey = message.payload?.apiKey || '';
            if (!apiKey) {
                const apiKeys = await context.configService.getApiKeys();
                apiKey = apiKeys?.[0] || '';
            }

            // Get endpoint based on provider, not from generic getEndpoint()
            let endpoint = message.payload?.endpoint || '';
            if (!endpoint) {
                // Get provider-specific endpoint
                switch (provider) {
                    case 'openai':
                        endpoint = context.configService.getOpenaiEndpoint();
                        break;
                    case 'ollama':
                        endpoint = context.configService.getOllamaEndpoint();
                        break;
                    case 'anthropic':
                        endpoint = context.configService.getAnthropicEndpoint();
                        break;
                    case 'xai':
                        endpoint = context.configService.getXaiEndpoint();
                        break;
                    case 'google':
                        endpoint = context.configService.getGoogleEndpoint();
                        break;
                    case 'groq':
                        endpoint = context.configService.getGroqEndpoint();
                        break;
                    case 'openrouter':
                        endpoint = context.configService.getOpenrouterEndpoint();
                        break;
                    case 'zai':
                        endpoint = context.configService.getZaiEndpoint();
                        break;
                    default:
                        endpoint = context.configService.getEndpoint() || '';
                }
            }

            console.log('[ModelHandler] requestModels:', { provider, endpoint, apiKey, 'hasEndpointInPayload': !!message.payload?.endpoint });

            if (apiKey) {
                const cacheKey = `${provider}|${endpoint}|${apiKey}`;
                const now = Date.now();
                const isForceRefresh = message.payload?.forceRefresh === true;

                if (!isForceRefresh) {
                    const cached = modelsCache.get(cacheKey);
                    if (cached && (now - cached.timestamp < MODEL_CACHE_TTL)) {
                        console.log('[ModelHandler] Serving models from cache');
                        context.postMessage({ command: 'updateModels', payload: cached.models });
                        return;
                    }
                }

                const models = await context.llmService.listModels(provider as any, apiKey, endpoint);
                console.log('[ModelHandler] Models fetched:', models);

                // Fetch max context for each model
                const { ModelInfoProvider } = require('../../../services/llm/ModelInfoProvider');
                const { STATIC_MODEL_REGISTRY } = require('../../../constants/ModelRegistry');
                const modelsWithContext = await Promise.all(
                    models.map(async (modelId: string) => {
                        // First check static registry for speed
                        const staticInfo = STATIC_MODEL_REGISTRY[modelId];
                        if (staticInfo?.maxContextTokens) {
                            return { id: modelId, maxContext: staticInfo.maxContextTokens };
                        }
                        // Then try dynamic fetch (with timeout protection)
                        try {
                            const info = await Promise.race([
                                ModelInfoProvider.getInstance().getModelInfo(provider, modelId, apiKey, endpoint),
                                new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
                            ]);
                            return { id: modelId, maxContext: info?.maxContextTokens || undefined };
                        } catch {
                            return { id: modelId, maxContext: undefined };
                        }
                    })
                );

                modelsCache.set(cacheKey, { models: modelsWithContext, timestamp: now });
                context.postMessage({ command: 'updateModels', payload: modelsWithContext });
            } else {
                context.postMessage({ command: 'updateModels', payload: [] });
            }
        } catch (error) {
            console.error('[ModelHandler] Error fetching models:', error);
            context.postMessage({ command: 'updateModels', payload: [] });
        }
    },

    selectModel: async (message, context) => {
        const { model, apiKey: payloadApiKey, endpoint: payloadEndpoint } = message.payload || {};
        if (model) {
            await context.configService.setModel(model);

            // Fetch model info and update max context
            try {
                const { ModelInfoProvider } = require('../../../services/llm/ModelInfoProvider');
                const provider = context.configService.getLlmProvider();

                // Use endpoint from payload first, then fall back to stored endpoint
                let endpoint = payloadEndpoint || '';
                if (!endpoint) {
                    // Get provider-specific endpoint
                    switch (provider) {
                        case 'openai': endpoint = context.configService.getOpenaiEndpoint(); break;
                        case 'ollama': endpoint = context.configService.getOllamaEndpoint(); break;
                        case 'anthropic': endpoint = context.configService.getAnthropicEndpoint(); break;
                        case 'xai': endpoint = context.configService.getXaiEndpoint(); break;
                        case 'google': endpoint = context.configService.getGoogleEndpoint(); break;
                        case 'groq': endpoint = context.configService.getGroqEndpoint(); break;
                        case 'openrouter': endpoint = context.configService.getOpenrouterEndpoint(); break;
                        case 'zai': endpoint = context.configService.getZaiEndpoint(); break;
                        default: endpoint = context.configService.getEndpoint() || '';
                    }
                }

                // Use apiKey from payload first, then fall back to stored keys
                let apiKey = payloadApiKey || '';
                if (!apiKey) {
                    const apiKeys = await context.configService.getApiKeys();
                    apiKey = apiKeys?.[0] || '';
                }

                console.log('[ModelHandler] selectModel fetching model info:', { provider, model, endpoint, hasApiKey: !!apiKey });
                const modelInfo = await ModelInfoProvider.getInstance().getModelInfo(provider, model, apiKey, endpoint);
                if (modelInfo && modelInfo.maxContextTokens) {
                    console.log('[ModelHandler] Model info fetched:', model, 'maxContext:', modelInfo.maxContextTokens);
                    context.postMessage({ command: 'modelMaxContextUpdated', payload: modelInfo.maxContextTokens });
                }
            } catch (error) {
                console.warn('[ModelHandler] Failed to fetch model info:', error);
            }

            context.postMessage({ command: 'modelChanged', payload: model });
        }
    }
};

/**
 * Handler for profile-related commands
 */
const profileHandlers: Record<string, MessageHandler> = {
    getProfiles: async (_message, context) => {
        const profiles = context.configService.getLlmProfiles();
        const activeProfileId = context.configService.getActiveProfileId();

        // Fetch API keys for each profile from SecretStorage
        const profilesWithKeys = await Promise.all(
            profiles.map(async (p: any) => {
                try {
                    const apiKey = await context.configService.getProfileApiKey?.(p.id);
                    return { ...p, apiKey: apiKey || '' };
                } catch {
                    return { ...p, apiKey: '' };
                }
            })
        );

        context.postMessage({
            command: 'profilesResponse',
            payload: { profiles: profilesWithKeys, activeProfileId }
        });
    },

    // Alias for UI
    requestProfiles: async (_message, context) => {
        const profiles = context.configService.getLlmProfiles();
        const activeProfileId = context.configService.getActiveProfileId();

        // Fetch API keys for each profile from SecretStorage
        const profilesWithKeys = await Promise.all(
            profiles.map(async (p: any) => {
                try {
                    const apiKey = await context.configService.getProfileApiKey?.(p.id);
                    return { ...p, apiKey: apiKey || '' };
                } catch {
                    return { ...p, apiKey: '' };
                }
            })
        );

        context.postMessage({
            command: 'profilesResponse',
            payload: { profiles: profilesWithKeys, activeProfileId }
        });
    },

    selectProfile: async (message, context) => {
        const { profileId } = message.payload || {};
        if (profileId) {
            await context.configService.setActiveProfileId(profileId);
            context.postMessage({ command: 'activeProfileChanged', payload: profileId });
        }
    },

    // Alias for UI (Header uses this)
    setActiveProfile: async (message, context) => {
        const { id } = message.payload || {};
        console.log('[ProfileHandler] setActiveProfile called with id:', id);
        if (id) {
            await context.configService.setActiveProfileId(id);
            console.log('[ProfileHandler] setActiveProfileId saved, new activeId:', context.configService.getActiveProfileId());
            context.postMessage({ command: 'activeProfileChanged', payload: id });
        }
    },

    deleteProfile: async (message, context) => {
        const { profileId, id } = message.payload || {};
        const targetId = profileId || id;
        console.log('[ProfileHandler] deleteProfile called with:', { profileId, id, targetId });
        if (targetId) {
            await context.configService.deleteProfile(targetId);
            // Refresh profiles list with API keys
            const profiles = context.configService.getLlmProfiles();
            const activeProfileId = context.configService.getActiveProfileId();
            const profilesWithKeys = await Promise.all(
                profiles.map(async (p: any) => {
                    try {
                        const apiKey = await context.configService.getProfileApiKey?.(p.id);
                        return { ...p, apiKey: apiKey || '' };
                    } catch {
                        return { ...p, apiKey: '' };
                    }
                })
            );
            context.postMessage({
                command: 'profilesResponse',
                payload: { profiles: profilesWithKeys, activeProfileId }
            });
        }
    },

    saveProfile: async (message, context) => {
        const { profile, apiKey, activateAfterSave } = message.payload || {};
        if (profile) {
            console.log('[ProfileHandler] saveProfile called with:', { profileId: profile.id, name: profile.name, hasApiKey: !!apiKey });

            // Save the profile using ConfigService
            const savedProfile = await context.configService.saveProfile(profile, apiKey);

            // Activate if requested
            if (activateAfterSave && savedProfile?.id) {
                await context.configService.setActiveProfileId(savedProfile.id);
                context.postMessage({ command: 'activeProfileChanged', payload: savedProfile.id });
            }

            // Refresh profiles list with API keys
            const profiles = context.configService.getLlmProfiles();
            const activeProfileId = context.configService.getActiveProfileId();
            const profilesWithKeys = await Promise.all(
                profiles.map(async (p: any) => {
                    try {
                        const key = await context.configService.getProfileApiKey?.(p.id);
                        return { ...p, apiKey: key || '' };
                    } catch {
                        return { ...p, apiKey: '' };
                    }
                })
            );
            context.postMessage({
                command: 'profilesResponse',
                payload: { profiles: profilesWithKeys, activeProfileId }
            });

            console.log('[ProfileHandler] Profile saved and activated:', savedProfile?.id);
        }
    }
};

/**
 * Handler for slash commands
 */
const slashCommandHandlers: Record<string, MessageHandler> = {
    getSlashCommands: async (_message, context) => {
        const commands = [
            { command: '/clear', description: 'Clear the conversation' },
            { command: '/help', description: 'Show available commands' },
            { command: '/model', description: 'Change the model' },
            { command: '/export', description: 'Export conversation' },
            { command: '/settings', description: 'Open settings' }
        ];
        context.postMessage({ command: 'slashCommandsResponse', payload: commands });
    }
};

/**
 * Handler for debug commands
 */
const debugHandlers: Record<string, MessageHandler> = {
    debugLog: async (message, _context) => {
        console.log('[WebView]', message.payload);
    }
};

/**
 * Handler for data initialization commands
 */
const dataHandlers: Record<string, MessageHandler> = {
    requestInitialData: async (_message, context) => {
        // Send all initial data to UI
        const profiles = context.configService.getLlmProfiles();
        const activeProfileId = context.configService.getActiveProfileId();
        const settings = {
            llmProvider: context.configService.getLlmProvider() || 'openai',
            model: context.configService.getModel() || 'gpt-4o',
            endpoint: context.configService.getEndpoint() || ''
        };
        context.postMessage({
            command: 'initialDataLoaded',
            payload: { profiles, activeProfileId, settings }
        });
    },

    requestHistory: async (_message, context) => {
        // History is managed by Orchestrator, just forward to it
        context.postMessage({ command: 'historyResponse', payload: [] });
    }
};

/**
 * Handler for agent-related commands
 */
const agentHandlers: Record<string, MessageHandler> = {
    requestAgentList: async (_message, context) => {
        const internalAgents = context.configService.getInternalAgents();
        context.postMessage({ command: 'agentListResponse', payload: internalAgents });
    },

    requestAgents: async (_message, context) => {
        const internalAgents = context.configService.getInternalAgents();
        context.postMessage({ command: 'agentsResponse', payload: internalAgents });
    }
};

/**
 * Handler for feature toggle commands
 */
const featureHandlers: Record<string, MessageHandler> = {
    requestFeatureToggles: async (_message, context) => {
        const featureToggles = {
            checkpointsEnabled: context.configService.getCheckpointsEnabled(),
            maxContextOverride: context.configService.getMaxContextOverride(),
            // Add other feature toggles as needed
        };
        context.postMessage({ command: 'featureTogglesResponse', payload: featureToggles });
    },

    saveWebSearchSettings: async (message, context) => {
        const { provider, apiKey, endpoint } = message.payload || {};
        // Save web search settings
        await context.configService.setWebSearchProvider(provider || 'tavily');
        await context.configService.setWebSearchApiKey(apiKey || '');
        if (endpoint) {
            await context.configService.setWebSearchEndpoint(endpoint);
        }
        context.postMessage({ command: 'webSearchSettingsSaved', payload: { provider } });
    },

    refreshConfiguredItems: async (_message, context) => {
        // Refresh all configured items
        const profiles = context.configService.getLlmProfiles();
        const activeProfileId = context.configService.getActiveProfileId();
        context.postMessage({
            command: 'itemsRefreshed',
            payload: { profiles, activeProfileId }
        });
    }
};

// ============================================================================
// Handler Factory
// ============================================================================

/**
 * Factory for creating configured message handler registries
 */
export class HandlerFactory {
    /**
     * Create a fully configured message handler registry
     */
    static createRegistry(): MessageHandlerRegistry {
        const registry = new MessageHandlerRegistry();

        // Register settings handlers
        for (const [command, handler] of Object.entries(settingsHandlers)) {
            registry.register(command, handler);
        }

        // Register model handlers
        for (const [command, handler] of Object.entries(modelHandlers)) {
            registry.register(command, handler);
        }

        // Register profile handlers
        for (const [command, handler] of Object.entries(profileHandlers)) {
            registry.register(command, handler);
        }

        // Register slash command handlers
        for (const [command, handler] of Object.entries(slashCommandHandlers)) {
            registry.register(command, handler);
        }

        // Register debug handlers
        for (const [command, handler] of Object.entries(debugHandlers)) {
            registry.register(command, handler);
        }

        // Register data handlers
        for (const [command, handler] of Object.entries(dataHandlers)) {
            registry.register(command, handler);
        }

        // Register agent handlers
        for (const [command, handler] of Object.entries(agentHandlers)) {
            registry.register(command, handler);
        }

        // Register feature handlers
        for (const [command, handler] of Object.entries(featureHandlers)) {
            registry.register(command, handler);
        }

        console.log(`[HandlerFactory] Registered handlers for commands: ${registry.getRegisteredCommands().join(', ')}`);

        return registry;
    }

    /**
     * Create a handler for a specific type
     * @deprecated Use createRegistry() instead
     */
    static createHandler(type: string): MessageHandler | null {
        const allHandlers: Record<string, MessageHandler> = {
            ...settingsHandlers,
            ...modelHandlers,
            ...profileHandlers,
            ...slashCommandHandlers,
            ...debugHandlers,
            ...dataHandlers,
            ...agentHandlers,
            ...featureHandlers
        };
        return allHandlers[type] || null;
    }

    /**
     * Get a handler for a specific type
     * @deprecated Use createRegistry() instead
     */
    static getHandler(type: string): MessageHandler | null {
        return this.createHandler(type);
    }
}

// ============================================================================
// Exports
// ============================================================================

export {
    settingsHandlers,
    modelHandlers,
    profileHandlers,
    slashCommandHandlers,
    debugHandlers,
    dataHandlers,
    agentHandlers,
    featureHandlers
};
