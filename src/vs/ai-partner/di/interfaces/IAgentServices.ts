/**
 * Interfaces for Agent Services
 */

export interface AgentConstructorParams {
    llmService: any;
    configService: any;
    sessionManager?: any;
    [key: string]: any;
}

export interface AgentConfig {
    name: string;
    description: string;
    category: 'core' | 'specialized' | 'utility';
    agentClass: any;
    dependencies?: string[];
    enabled?: boolean;
}

export interface IModelContextService {
    getContext(): any;
    updateContext(context: any): void;
}

export interface IAgentFactory {
    /**
     * Register an agent configuration
     */
    registerAgent(config: AgentConfig): void;

    /**
     * Get an agent configuration by name
     */
    getAgentConfig(name: string): AgentConfig | undefined;

    /**
     * Get all agent configurations
     */
    getAllAgentConfigs(): AgentConfig[];

    /**
     * Create an agent instance
     */
    createAgent(name: string, params: AgentConstructorParams): any;
}

export interface IAgentRegistry {
    /**
     * Register an agent
     */
    register(name: string, agent: any): void;

    /**
     * Get an agent by name
     */
    get(name: string): any | undefined;

    /**
     * Get all registered agent names
     */
    getAllNames(): string[];

    /**
     * Check if an agent is registered
     */
    has(name: string): boolean;
}
