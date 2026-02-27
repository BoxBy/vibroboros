/**
 * Dependency Injection Module
 *
 * Exports DI container, composition root, and migration utilities.
 *
 * @example
 * import { CompositionRoot, ServiceIdentifiers } from './di';
 * const config = CompositionRoot.resolve<IConfigService>(ServiceIdentifiers.ConfigService);
 */

export {
    ServiceContainer,
    IServiceContainer,
    ServiceLifetime,
    serviceContainer,
    inject,
    injectable
} from './ServiceContainer';

export {
    CompositionRoot,
    getService,
    getOptionalService,
    ServiceIdentifiers
} from './CompositionRoot';

export {
    createServiceBindings,
    bootstrapContainer,
    getRequiredService,
    getOptionalService as getOptionalFromContainer,
    ServiceBindingRegistry,
    ServiceBinding
} from './bindings';

export {
    ServiceLocator,
    locate
} from './ServiceLocator';

// Re-export types
export type { ServiceFactory } from './bindings';

// Service interfaces
export type { IConfigService, LLMProfile, ISecretStorageService } from './interfaces/IConfigService';
export type { ILLMService, LlmMessage, LlmMessageContent, LlmFullResponse, LLMProvider } from './interfaces/ILLMService';
export type { ISemanticModelService, CodeSymbol, Relation, SemanticGraph } from './interfaces/ISemanticModelService';
export type { ISessionManager, ChatMessage, TaskItem, SessionMetadata, SessionState } from './interfaces/ISessionManager';

// System service interfaces
export type { ISystemPromptFactory, AgentRole, ContextOptions, GenerateOptions } from './interfaces/ISystemPromptFactory';
export type { IMemoryService, UserPreferences } from './interfaces/IMemoryService';

// Agent service interfaces
export type { IAgentFactory, IAgentRegistry, AgentConstructorParams, AgentConfig, IModelContextService } from './interfaces/IAgentServices';

// MCP service interfaces
export type { IMCPServer, IMCPToolService, IMCPManager, IMCPHealthCheckService } from './interfaces/IMCPServer';

// File operation interface
export type { IFileOperationService } from './interfaces/IFileOperationService';
