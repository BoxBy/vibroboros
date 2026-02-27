/**
 * Service Locator
 *
 * A bridge pattern to help migrate from singleton pattern to DI.
 * Provides centralized access to services through the CompositionRoot.
 *
 * @deprecated Prefer using constructor injection via CompositionRoot.resolve()
 */

import { CompositionRoot, ServiceIdentifiers } from './CompositionRoot';
import type {
    IConfigService,
    ILLMService,
    ISemanticModelService,
    ISessionManager,
    ISystemPromptFactory,
    IMemoryService,
    IAgentFactory,
    IAgentRegistry,
    IModelContextService,
    IMCPServer,
    IMCPToolService,
    IMCPManager,
    IMCPHealthCheckService,
    IFileOperationService
} from './index';

/**
 * Service Locator class
 * Provides convenient access to services
 */
export class ServiceLocator {
    /**
     * Get Config Service
     */
    static getConfig(): IConfigService {
        return CompositionRoot.resolve<IConfigService>(ServiceIdentifiers.ConfigService);
    }

    /**
     * Get Config Service (alias)
     */
    static getConfigService(): IConfigService {
        return this.getConfig();
    }

    /**
     * Get LLM Service
     */
    static getLLMService(): ILLMService {
        return CompositionRoot.resolve<ILLMService>(ServiceIdentifiers.LLMService);
    }

    /**
     * Get Semantic Model Service
     * Temporarily disabled
     */
    // static getSemanticModelService(): ISemanticModelService {
    //     return CompositionRoot.resolve<ISemanticModelService>(ServiceIdentifiers.SemanticModelService);
    // }

    /**
     * Get Session Manager
     */
    static getSessionManager(): ISessionManager {
        return CompositionRoot.resolve<ISessionManager>(ServiceIdentifiers.SessionManager);
    }

    /**
     * Get System Prompt Factory
     */
    static getSystemPromptFactory(): ISystemPromptFactory {
        return CompositionRoot.resolve<ISystemPromptFactory>(ServiceIdentifiers.SystemPromptFactory);
    }

    /**
     * Get Memory Service
     */
    static getMemoryService(): IMemoryService {
        return CompositionRoot.resolve<IMemoryService>(ServiceIdentifiers.MemoryService);
    }

    /**
     * Get Agent Factory
     */
    static getAgentFactory(): IAgentFactory {
        return CompositionRoot.resolve<IAgentFactory>(ServiceIdentifiers.AgentFactory);
    }

    /**
     * Get Agent Registry
     */
    static getAgentRegistry(): IAgentRegistry {
        return CompositionRoot.resolve<IAgentRegistry>(ServiceIdentifiers.AgentRegistry);
    }

    /**
     * Get Model Context Service
     */
    static getModelContextService(): IModelContextService {
        return CompositionRoot.resolve<IModelContextService>(ServiceIdentifiers.ModelContextService);
    }

    /**
     * Get Token Usage Service (optional, may not be registered)
     */
    static getTokenUsageService(): any {
        return CompositionRoot.resolveOptional(ServiceIdentifiers.TokenUsageService);
    }

    /**
     * Get File Operation Service
     */
    static getFileOperationService(): IFileOperationService {
        return CompositionRoot.resolve<IFileOperationService>(ServiceIdentifiers.FileOperationService);
    }

    /**
     * Get MCP Tool Service
     */
    static getMCPToolService(): IMCPToolService {
        return CompositionRoot.resolve<IMCPToolService>(ServiceIdentifiers.MCPToolService);
    }

    /**
     * Get MCP Manager
     */
    static getMCPManager(): IMCPManager {
        return CompositionRoot.resolve<IMCPManager>(ServiceIdentifiers.MCPManager);
    }

    /**
     * Get MCP Server
     */
    static getMCPServer(): IMCPServer {
        return CompositionRoot.resolve<IMCPServer>(ServiceIdentifiers.MCPServer);
    }

    /**
     * Get MCP Health Check Service
     */
    static getMCPHealthCheckService(): IMCPHealthCheckService {
        return CompositionRoot.resolve<IMCPHealthCheckService>(ServiceIdentifiers.MCPHealthCheckService);
    }
}

/**
 * Convenience function to locate a service
 *
 * @example
 * const config = locate<IConfigService>(ServiceIdentifiers.ConfigService);
 */
export function locate<T>(serviceIdentifier: symbol): T {
    return CompositionRoot.resolve<T>(serviceIdentifier);
}
