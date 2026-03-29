/**
 * Composition Root
 *
 * Central place for registering all services and their dependencies.
 * This is the only place where the container should be directly used.
 *
 * Architecture:
 * 1. Bootstrap all service bindings
 * 2. Resolve dependencies in correct order
 * 3. Provide service access to application
 */

import { ServiceContainer, serviceContainer } from './ServiceContainer';
import { bootstrapContainer, getRequiredService, getOptionalService as getDIOptionalService } from './bindings';

/**
 * Service identifiers (symbols for type safety)
 * These are used throughout the application for type-safe service resolution
 */
export const ServiceIdentifiers = {
    // ========================================================================
    // Domain Layer
    // ========================================================================
    EventBus: Symbol('IEventBus'),

    // ========================================================================
    // Infrastructure Layer - Core Services
    // ========================================================================
    LLMService: Symbol('ILLMService'),
    ConfigService: Symbol('IConfigService'),
    Logger: Symbol('ILogger'),
    SecretStorage: Symbol('ISecretStorage'),
    AuthService: Symbol('IAuthService'),

    // ========================================================================
    // Infrastructure Layer - LLM Sub-services
    // ========================================================================
    TokenizerService: Symbol('ITokenizerService'),
    ModelInfoProvider: Symbol('IModelInfoProvider'),
    ContextManager: Symbol('IContextManager'),
    RequestHandler: Symbol('IRequestHandler'),

    // ========================================================================
    // Infrastructure Layer - Search Services
    // ========================================================================
    EmbeddingService: Symbol('IEmbeddingService'),
    RerankerService: Symbol('IRerankerService'),
    BM25Service: Symbol('IBM25Service'),
    SearchService: Symbol('ISearchService'),
    UnifiedSearchService: Symbol('IUnifiedSearchService'),
    CallGraphService: Symbol('ICallGraphService'),

    // ========================================================================
    // Infrastructure Layer - MCP Services
    // ========================================================================
    MCPServer: Symbol('IMCPServer'),
    MCPToolService: Symbol('IMCPToolService'),
    MCPManager: Symbol('IMCPManager'),
    MCPHealthCheckService: Symbol('IMCPHealthCheckService'),
    FileOperationService: Symbol('IFileOperationService'),

    // ========================================================================
    // Session & State Services
    // ========================================================================
    SessionManager: Symbol('ISessionManager'),
    MemoryService: Symbol('IMemoryService'),
    CheckpointService: Symbol('ICheckpointService'),
    TokenUsageService: Symbol('ITokenUsageService'),
    EpisodicMemoryService: Symbol('IEpisodicMemoryService'),

    // ========================================================================
    // Agent Services
    // ========================================================================
    AgentFactory: Symbol('IAgentFactory'),
    AgentRegistry: Symbol('IAgentRegistry'),
    OrchestratorAgent: Symbol('IOrchestratorAgent'),

    // ========================================================================
    // System Services
    // ========================================================================
    SystemPromptFactory: Symbol('ISystemPromptFactory'),
    ModelContextService: Symbol('IModelContextService'),

    // ========================================================================
    // Presentation Layer
    // ========================================================================
    A2AServer: Symbol('IA2AServer'),
    AIPartnerViewProvider: Symbol('IAIPartnerViewProvider'),
};

/**
 * Composition Root class
 */
export class CompositionRoot {
    private static initialized = false;
    private static extensionContext: any;

    /**
     * Initialize all services
     * Should be called once at application startup with the extension context
     */
    static initialize(context?: any): void {
        if (this.initialized) {
            console.warn('[CompositionRoot] Already initialized');
            return;
        }

        this.extensionContext = context;

        // Store extension context in service container for ConfigService
        if (context) {
            serviceContainer.setExtensionContext(context);
        }

        console.log('[CompositionRoot] Initializing DI container...');

        try {
            // Bootstrap all service bindings
            bootstrapContainer(serviceContainer);

            this.initialized = true;
            console.log('[CompositionRoot] DI container initialized successfully');
        } catch (error) {
            console.error('[CompositionRoot] Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Resolve a required service from the container
     * @throws Error if service is not registered
     */
    static resolve<T>(serviceIdentifier: symbol): T {
        if (!this.initialized) {
            throw new Error('CompositionRoot has not been initialized. Call CompositionRoot.initialize() first.');
        }
        return getRequiredService<T>(serviceContainer, serviceIdentifier);
    }

    /**
     * Resolve an optional service from the container
     * @returns undefined if service is not registered
     */
    static resolveOptional<T>(serviceIdentifier: symbol): T | undefined {
        if (!this.initialized) {
            console.warn('[CompositionRoot] Attempting to resolve service before initialization');
            return undefined;
        }
        return getOptionalService<T>(serviceContainer, serviceIdentifier);
    }

    /**
     * Check if a service is registered
     */
    static has(serviceIdentifier: symbol): boolean {
        return serviceContainer.has(serviceIdentifier);
    }

    /**
     * Check if initialization is complete
     */
    static isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Get the extension context
     */
    static getExtensionContext(): any {
        return this.extensionContext;
    }

    /**
     * Reset the container (for testing purposes)
     */
    static reset(): void {
        serviceContainer.clear();
        serviceContainer.setExtensionContext(undefined);
        this.initialized = false;
        this.extensionContext = undefined;
        console.log('[CompositionRoot] Container reset');
    }

    /**
     * Register a dynamic service at runtime
     * Use this for services that are created dynamically (e.g., MCP server instances)
     */
    static registerDynamic<T>(identifier: symbol, instance: T): void {
        serviceContainer.registerSingleton(identifier, instance);
        console.log(`[CompositionRoot] Registered dynamic service: ${identifier.toString()}`);
    }

    /**
     * Get the underlying container for advanced scenarios
     * Prefer using CompositionRoot.resolve() in most cases
     */
    static getContainer(): ServiceContainer {
        return serviceContainer;
    }
}

/**
 * Convenience function to get a service from the container
 *
 * @example
 * const config = getService<IConfigService>(ServiceIdentifiers.ConfigService);
 */
export function getService<T>(serviceIdentifier: symbol): T {
    return CompositionRoot.resolve<T>(serviceIdentifier);
}

/**
 * Convenience function to get an optional service
 *
 * @example
 * const service = getOptionalService<ITokenUsageService>(ServiceIdentifiers.TokenUsageService);
 * if (service) { ... }
 */
export function getOptionalService<T>(serviceIdentifier: symbol): T | undefined {
    return CompositionRoot.resolveOptional<T>(serviceIdentifier);
}
