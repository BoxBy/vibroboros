/**
 * Interface for System Prompt Factory
 * Generates system prompts for different agent roles
 */

export type AgentRole = 'router' | 'pm' | 'planner' | 'worker' | 'debugger' | 'CodeEditAgent' | 'BugFixAgent' | 'BrainstormAgent' | 'ReadmeGenerationAgent' | 'ContextManagementAgent' | 'TaskDecompositionAgent' | 'TestGenerationAgent' | 'DocumentationGenerationAgent';

export interface ContextOptions {
    includeDirectoryStructure?: boolean;
    includeSmartContext?: boolean;
    targetFile?: string;
    relatedFiles?: string[];
    includeAgentDescriptions?: boolean;
    excludeHistory?: boolean;
    targetContent?: string;
    dynamicRules?: string[];
    examples?: string;
}

export interface GenerateOptions {
    role: AgentRole;
    agentName: string;
    complexity?: number;
    userInput?: string;
    contextOptions?: ContextOptions;
}

export interface ISystemPromptFactory {
    /**
     * Generate a system prompt for the specified agent role
     */
    generate(role: AgentRole, agentName: string, complexity?: number, userInput?: string, contextOptions?: ContextOptions): Promise<string>;

    /**
     * Generate a system prompt with full options
     */
    generateWithOptions(options: GenerateOptions): Promise<string>;

    /**
     * Get descriptions of all available agents
     */
    getAgentDescriptions(): string;

    /**
     * Get the project directory structure
     */
    getDirectoryStructure(): string;

    /**
     * Get smart context for a target file
     */
    getSmartContext(targetFile: string, relatedFiles: string[]): string;
}
