/**
 * Interface for System Prompt Factory
 * Generates system prompts for different agent roles
 */

export type AgentRole = 'router' | 'pm' | 'planner' | 'worker' | 'debugger' | 'CodeEditAgent' | 'BugFixAgent' | 'BrainstormAgent' | 'ReadmeGenerationAgent' | 'ContextManagementAgent' | 'TaskDecompositionAgent' | 'TestGenerationAgent' | 'DocumentationGenerationAgent' | 'PromptGenerationAgent' | 'RefactoringSuggestionAgent';

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
    seniorIntuition?: string;
}

export interface ISystemPromptFactory {
    /**
     * Generate a system prompt for the specified agent role
     */
    generate(role: AgentRole, agentName: string, complexity?: number, userInput?: string, contextOptions?: ContextOptions, seniorIntuition?: string): Promise<string>;

    /**
     * Generate a system prompt with full options
     */
    generateWithOptions(options: GenerateOptions): Promise<string>;

    /**
     * Get descriptions of all available agents
     */
    getAgentDescriptions(): string;
}
