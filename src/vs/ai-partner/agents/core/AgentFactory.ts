// AgentFactory.ts - Agent 생성 로직 중앙화

import { BaseAgent } from './BaseAgent';
import { AgentRegistry } from './AgentRegistry';
import * as vscode from 'vscode';

/**
 * Agent constructor parameters
 */
export interface AgentConstructorParams {
    card: any; // AgentCard from A2A SDK
    state: vscode.Memento;
    workspaceRoot: string;
    // Add other common dependencies as needed
}

/**
 * Agent configuration
 */
export interface AgentConfig {
    name: string;
    description: string;
    category: 'core' | 'specialized' | 'utility';
    agentClass: new (params: AgentConstructorParams) => BaseAgent;
    dependencies?: string[]; // MCP servers or other agents
    enabled?: boolean;
}

/**
 * AgentFactory - Centralized agent creation and management
 * Singleton pattern
 */
export class AgentFactory {
    private static instance: AgentFactory;
    private agentConfigs: Map<string, AgentConfig> = new Map();
    
    private constructor() {}
    
    public static getInstance(): AgentFactory {
        if (!AgentFactory.instance) {
            AgentFactory.instance = new AgentFactory();
        }
        return AgentFactory.instance;
    }
    
    /**
     * Register an agent configuration
     */
    public registerAgent(config: AgentConfig): void {
        // Validation
        if (!config.name || !config.agentClass) {
            throw new Error('Agent config must have name and agentClass');
        }
        
        if (this.agentConfigs.has(config.name)) {
            console.warn(`Agent ${config.name} is already registered, overwriting`);
        }
        
        this.agentConfigs.set(config.name, {
            ...config,
            enabled: config.enabled !== false // Default to enabled
        });
        
        console.log(`Agent registered: ${config.name} (${config.category})`);
    }
    
    /**
     * Create an agent instance
     */
    public createAgent(name: string, params: AgentConstructorParams): BaseAgent {
        const config = this.agentConfigs.get(name);
        
        if (!config) {
            throw new Error(`Agent ${name} is not registered`);
        }
        
        if (!config.enabled) {
            throw new Error(`Agent ${name} is disabled`);
        }
        
        // Check dependencies
        if (config.dependencies) {
            for (const dep of config.dependencies) {
                // TODO: Check if MCP server is available
                console.log(`Checking dependency for ${name}: ${dep}`);
            }
        }
        
        // Create instance
        const agent = new config.agentClass(params);
        
        // Register with AgentRegistry
        AgentRegistry.getInstance().register(name, agent);
        
        return agent;
    }
    
    /**
     * Get all available agents (that meet dependency requirements)
     */
    public getAllAvailableAgents(): AgentConfig[] {
        return Array.from(this.agentConfigs.values()).filter(config => {
            if (!config.enabled) {
                return false;
            }
            
            // TODO: Check dependencies (MCP servers, etc.)
            return true;
        });
    }
    
    /**
     * Get all registered agent configs
     */
    public getAllConfigs(): AgentConfig[] {
        return Array.from(this.agentConfigs.values());
    }
    
    /**
     * Register all core agents
     * Called during extension activation
     */
    public registerAllAgents(): void {
        // Import agent classes
        // Note: Actual imports will be added during implementation
        
        // Core agents
        this.registerAgent({
            name: 'OrchestratorAgent',
            description: 'Routes tasks and coordinates all agents',
            category: 'core',
            agentClass: require('../OrchestratorAgent').OrchestratorAgent
        });
        
        this.registerAgent({
            name: 'CodeEditAgent',
            description: 'Edits code: refactoring, adding comments/docstrings, fixing syntax, optimizing logic',
            category: 'specialized',
            agentClass: require('../CodeEditAgent').CodeEditAgent
        });
        
        this.registerAgent({
            name: 'TestGenerationAgent',
            description: 'Generates unit and integration tests',
            category: 'specialized',
            agentClass: require('../TestGenerationAgent').TestGenerationAgent
        });
        
        this.registerAgent({
            name: 'DocumentationGenerationAgent',
            description: 'Creates documentation FILES in docs/ folder (README.md, API docs, user guides, tutorials). Does NOT add inline comments.',
            category: 'specialized',
            agentClass: require('../DocumentationGenerationAgent').DocumentationGenerationAgent
        });
        
        this.registerAgent({
            name: 'BrainstormAgent',
            description: 'Creates implementation plans for complex tasks',
            category: 'specialized',
            agentClass: require('../BrainstormAgent').BrainstormAgent
        });
        
        // BugFixAgent is not implemented yet - remove from registration
        // this.registerAgent({
        //     name: 'BugFixAgent',
        //     description: 'Analyzes and fixes bugs',
        //     category: 'specialized',
        //     agentClass: require('../BugFixAgent').BugFixAgent
        // });
        
        this.registerAgent({
            name: 'CodeAnalysisAgent',
            description: 'Analyzes code quality and performance',
            category: 'utility',
            agentClass: require('../CodeAnalysisAgent').CodeAnalysisAgent
        });
        
        this.registerAgent({
            name: 'SecurityAnalysisAgent',
            description: 'Scans for security vulnerabilities',
            category: 'utility',
            agentClass: require('../SecurityAnalysisAgent').SecurityAnalysisAgent
        });
        
        // Note: ReadmeGenerationAgent removed - its functionality is now part of DocumentationGenerationAgent
        // to avoid confusion and overlap. Use DocumentationGenerationAgent for all documentation needs.
        
        console.log(`Registered ${this.agentConfigs.size} agents`);
    }
}
