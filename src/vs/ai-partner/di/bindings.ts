/**
 * DI Container Service Bindings
 *
 * Comprehensive service bindings for dependency injection.
 * This file defines ALL service registrations and their dependencies.
 */

import { ServiceContainer, ServiceLifetime } from './ServiceContainer';
import { ServiceIdentifiers } from './CompositionRoot';

// ============================================================================
// Type Definitions
// ============================================================================

export type ServiceFactory<T> = (container: ServiceContainer) => T;

export interface ServiceBinding<T = any> {
    identifier: string | symbol;
    factory: ServiceFactory<T>;
    lifetime: ServiceLifetime;
    dependencies?: (string | symbol)[];
    description?: string;
}

// ============================================================================
// Service Binding Registry
// ============================================================================

export class ServiceBindingRegistry {
    private bindings = new Map<string | symbol, ServiceBinding>();

    register(binding: ServiceBinding): void {
        this.bindings.set(binding.identifier, binding);
    }

    get(identifier: string | symbol): ServiceBinding | undefined {
        return this.bindings.get(identifier);
    }

    getAll(): ServiceBinding[] {
        return Array.from(this.bindings.values());
    }
}

// ============================================================================
// Service Bindings Definition
// ============================================================================

/**
 * Create all service bindings for the application
 */
export function createServiceBindings(): ServiceBinding[] {
    const bindings: ServiceBinding[] = [];

    // ========================================================================
    // Infrastructure Layer - LLM Sub-services
    bindings.push({
        identifier: ServiceIdentifiers.TokenizerService,
        factory: (container) => {
            const { TokenizerService } = require('../services/llm/TokenizerService');
            return TokenizerService.getInstance();
        },
        lifetime: ServiceLifetime.SINGLETON,
        description: 'LLM tokenization service'
    });

    bindings.push({
        identifier: ServiceIdentifiers.ModelInfoProvider,
        factory: (container) => {
            const { ModelInfoProvider } = require('../services/llm/ModelInfoProvider');
            return ModelInfoProvider.getInstance();
        },
        lifetime: ServiceLifetime.SINGLETON,
        description: 'LLM model metadata provider'
    });

    bindings.push({
        identifier: ServiceIdentifiers.ContextManager,
        factory: (container) => {
            const { ContextManager } = require('../services/llm/ContextManager');
            return ContextManager.getInstance();
        },
        lifetime: ServiceLifetime.SINGLETON,
        description: 'LLM context window manager'
    });

    bindings.push({
        identifier: ServiceIdentifiers.RequestHandler,
        factory: (container) => {
            const { RequestHandler } = require('../services/llm/RequestHandler');
            return RequestHandler.getInstance();
        },
        lifetime: ServiceLifetime.SINGLETON,
        description: 'LLM request processing service'
    });

    // ========================================================================
    // Configuration Services (Layer 0 - Foundation)
    // ========================================================================

    bindings.push({
        identifier: ServiceIdentifiers.ConfigService,
        factory: (container) => {
            const { ConfigService } = require('../config_service');
            const { SecretStorageService } = require('../secret_storage_service');
            const context = container.getExtensionContext?.();
            if (!context) {
                throw new Error('Extension context is required for ConfigService');
            }
            const configService = new ConfigService(
                context,
                SecretStorageService.getInstance()
            );
            ConfigService.setInstance?.(configService);
            return configService;
        },
        lifetime: ServiceLifetime.SINGLETON,
        description: 'Configuration management service'
    });

    bindings.push({
        identifier: ServiceIdentifiers.Logger,
        factory: (container) => {
            const { DeveloperLogService } = require('../services/DeveloperLogService');
            return DeveloperLogService.getInstance();
        },
        lifetime: ServiceLifetime.SINGLETON,
        description: 'Developer logging service'
    });

    // ========================================================================
    // LLM Services (Layer 1 - Core AI)
    // ========================================================================

    bindings.push({
        identifier: ServiceIdentifiers.LLMService,
        factory: (container) => {
            const { LLMService } = require('../services/LLMService');
            const configService = container.resolve(ServiceIdentifiers.ConfigService);
            const llmService = new LLMService(configService);
            LLMService.setInstance?.(llmService);
            return llmService;
        },
        lifetime: ServiceLifetime.SINGLETON,
        dependencies: [ServiceIdentifiers.ConfigService],
        description: 'LLM communication service'
    });

    // ========================================================================
    // Search & Semantic Services (Layer 1)
    // ========================================================================
    // SemanticModelService removed — replaced by SymbolicSearchService

    // ========================================================================
    // Session & State Services (Layer 2)
    // ========================================================================

    bindings.push({
        identifier: ServiceIdentifiers.SessionManager,
        factory: (container) => {
            const { SessionManager } = require('../services/SessionManager');
            const context = container.getExtensionContext?.();
            if (!context) {
                throw new Error('Extension context is required for SessionManager');
            }
            const sessionManager = new SessionManager(context.globalState);
            SessionManager.setInstance?.(sessionManager);
            return sessionManager;
        },
        lifetime: ServiceLifetime.SINGLETON,
        description: 'Session state management'
    });

    bindings.push({
        identifier: ServiceIdentifiers.MemoryService,
        factory: (container) => {
            const { MemoryService } = require('../services/MemoryService');
            const memoryService = new MemoryService();
            MemoryService.setInstance?.(memoryService);
            return memoryService;
        },
        lifetime: ServiceLifetime.SINGLETON,
        description: 'Conversation memory service'
    });
 
    bindings.push({
        identifier: ServiceIdentifiers.EpisodicMemoryService,
        factory: (container) => {
            const { EpisodicMemoryService } = require('../services/EpisodicMemoryService');
            return new EpisodicMemoryService();
        },
        lifetime: ServiceLifetime.SINGLETON,
        description: 'Episodic memory and Senior Intuition service'
    });

    bindings.push({
        identifier: ServiceIdentifiers.CheckpointService,
        factory: (container) => {
            const { CheckpointService } = require('../services/CheckpointService');
            return new CheckpointService();
        },
        lifetime: ServiceLifetime.SINGLETON,
        description: 'Workspace checkpoint service'
    });

    bindings.push({
        identifier: ServiceIdentifiers.AuthService,
        factory: (container) => {
            const { AuthService } = require('../auth_service');
            const configService = container.resolve(ServiceIdentifiers.ConfigService);
            return AuthService.getInstance(configService);
        },
        lifetime: ServiceLifetime.SINGLETON,
        dependencies: [ServiceIdentifiers.ConfigService],
        description: 'Authentication and identity service'
    });

    // ========================================================================
    // Agent Services (Layer 3)
    // ========================================================================

    bindings.push({
        identifier: ServiceIdentifiers.AgentFactory,
        factory: (container) => {
            const { AgentFactory } = require('../agents/core/AgentFactory');
            const agentRegistry = container.resolve(ServiceIdentifiers.AgentRegistry);
            const agentFactory = new AgentFactory(agentRegistry);
            AgentFactory.setInstance?.(agentFactory);
            return agentFactory;
        },
        lifetime: ServiceLifetime.SINGLETON,
        dependencies: [ServiceIdentifiers.AgentRegistry],
        description: 'Agent creation factory'
    });

    bindings.push({
        identifier: ServiceIdentifiers.AgentRegistry,
        factory: (container) => {
            const { AgentRegistry } = require('../agents/core/AgentRegistry');
            const agentRegistry = new AgentRegistry();
            AgentRegistry.setInstance?.(agentRegistry);
            return agentRegistry;
        },
        lifetime: ServiceLifetime.SINGLETON,
        description: 'Agent registry and discovery'
    });

    // ========================================================================
    // System Services (Layer 4)
    // ========================================================================

    bindings.push({
        identifier: ServiceIdentifiers.SystemPromptFactory,
        factory: (container) => {
            const { SystemPromptFactory } = require('../services/SystemPromptFactory');
            const configService = container.resolve(ServiceIdentifiers.ConfigService);
            const systemPromptFactory = new SystemPromptFactory(
                configService
            );
            SystemPromptFactory.setInstance?.(systemPromptFactory);
            return systemPromptFactory;
        },
        lifetime: ServiceLifetime.SINGLETON,
        dependencies: [ServiceIdentifiers.ConfigService, ServiceIdentifiers.LLMService],
        description: 'System prompt generation'
    });

    bindings.push({
        identifier: ServiceIdentifiers.ModelContextService,
        factory: (container) => {
            const { ModelContextService } = require('../services/ModelContextService');
            return ModelContextService.getInstance();
        },
        lifetime: ServiceLifetime.SINGLETON,
        description: 'Model context management'
    });

    // ========================================================================
    // Event Services (Layer 4)
    // ========================================================================

    bindings.push({
        identifier: ServiceIdentifiers.EventBus,
        factory: (container) => {
            const { eventBus } = require('../domain/events');
            return eventBus;
        },
        lifetime: ServiceLifetime.SINGLETON,
        description: 'Application event bus'
    });

    // ========================================================================
    // MCP Services (Layer 5)
    // ========================================================================

    bindings.push({
        identifier: ServiceIdentifiers.FileOperationService,
        factory: (container) => {
            const { FileOperationService } = require('../server/tools/FileOperationService');
            return FileOperationService.getInstance();
        },
        lifetime: ServiceLifetime.SINGLETON,
        description: 'File operations for MCP tools'
    });

    bindings.push({
        identifier: ServiceIdentifiers.MCPToolService,
        factory: (container) => {
            const { ToolRegistry } = require('../server/tools/ToolRegistry');
            return ToolRegistry.getInstance();
        },
        lifetime: ServiceLifetime.SINGLETON,
        description: 'MCP tool registry'
    });

    bindings.push({
        identifier: ServiceIdentifiers.MCPManager,
        factory: (container) => {
            const { MCPServer } = require('../server/MCPServer');
            return MCPServer.getInstance?.() || new MCPServer();
        },
        lifetime: ServiceLifetime.SINGLETON,
        dependencies: [ServiceIdentifiers.FileOperationService, ServiceIdentifiers.MCPToolService],
        description: 'MCP server manager'
    });

    bindings.push({
        identifier: ServiceIdentifiers.MCPHealthCheckService,
        factory: (container) => {
            const { MCPHealthCheckService } = require('../services/MCPHealthCheckService');
            return MCPHealthCheckService.getInstance?.() || new MCPHealthCheckService();
        },
        lifetime: ServiceLifetime.SINGLETON,
        description: 'MCP health check service'
    });

    return bindings;
}

// ============================================================================
// Container Bootstrap
// ============================================================================

/**
 * Bootstrap the DI container with all service bindings
 */
export function bootstrapContainer(container: ServiceContainer): void {
    const bindings = createServiceBindings();
    const registry = new ServiceBindingRegistry();

    // Register all bindings
    for (const binding of bindings) {
        registry.register(binding);
    }

    // Register in container respecting dependency order
    const registered = new Set<string | symbol>();
    let pass = 0;
    const maxPasses = bindings.length + 1;

    while (registered.size < bindings.length && pass < maxPasses) {
        pass++;
        let registeredThisPass = 0;

        for (const binding of bindings) {
            if (registered.has(binding.identifier)) {
                continue;
            }

            // Check if all dependencies are registered
            const deps = binding.dependencies || [];
            const allDepsRegistered = deps.every(dep => registered.has(dep));

            if (allDepsRegistered) {
                container.register(
                    binding.identifier,
                    binding.factory,
                    binding.lifetime
                );
                registered.add(binding.identifier);
                registeredThisPass++;
            }
        }

        if (registeredThisPass === 0 && registered.size < bindings.length) {
            // Log remaining bindings that couldn't be registered
            const remaining = bindings.filter(b => !registered.has(b.identifier));
            console.warn('[DI] Could not register services (possible circular dependencies):',
                remaining.map(b => typeof b.identifier === 'symbol' ? b.identifier.toString() : b.identifier));
            break;
        }
    }

    console.log(`[DI] Container bootstrapped with ${registered.size}/${bindings.length} services in ${pass} passes`);
}

// ============================================================================
// Service Resolution Helpers
// ============================================================================

/**
 * Get a required service from the container
 * @throws Error if service is not registered
 */
export function getRequiredService<T>(container: ServiceContainer, identifier: string | symbol): T {
    if (!container.has(identifier)) {
        const name = typeof identifier === 'symbol' ? identifier.toString() : identifier;
        throw new Error(`Required service '${name}' is not registered in the DI container`);
    }
    return container.resolve<T>(identifier);
}

/**
 * Get an optional service from the container
 * @returns undefined if service is not registered
 */
export function getOptionalService<T>(container: ServiceContainer, identifier: string | symbol): T | undefined {
    if (!container.has(identifier)) {
        return undefined;
    }
    return container.resolve<T>(identifier);
}
