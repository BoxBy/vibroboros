/**
 * Constants for agent names to avoid hardcoded strings and prevent typos
 */

export const AgentNames = {
    ORCHESTRATOR: 'OrchestratorAgent',
    BRAINSTORM: 'BrainstormAgent',
    CODE_EDIT: 'CodeEditAgent',
    CODE_ANALYSIS: 'CodeAnalysisAgent',
    CODE_WATCHER: 'CodeWatcherAgent',
    CONTEXT_MANAGEMENT: 'ContextManagementAgent',
    DOCUMENTATION_GENERATION: 'DocumentationGenerationAgent',
    README_GENERATION: 'ReadmeGenerationAgent',
    REFACTORING_SUGGESTION: 'RefactoringSuggestionAgent',
    SECURITY_ANALYSIS: 'SecurityAnalysisAgent',
    TASK_DECOMPOSITION: 'TaskDecompositionAgent',
    TEST_GENERATION: 'TestGenerationAgent',
    // Legacy mappings
    COMMENT_GENERATION: 'CommentGenerationAgent',  // ??CodeEditAgent
    CODE_EXECUTION: 'CodeExecutionAgent',  // ??CodeEditAgent
} as const;

export type AgentName = typeof AgentNames[keyof typeof AgentNames];

/**
 * Suggestion types for file operations
 */
export const SuggestionTypes = {
    CREATE_FILE: 'create-file',
    EDIT_FILE: 'edit-file',
    COMMAND_EXECUTION: 'command-execution',
} as const;

export type SuggestionType = typeof SuggestionTypes[keyof typeof SuggestionTypes];

/**
 * A2A Message command types (internal)
 */
export const MessageCommands = {
    PROPOSE_PLAN: 'propose-plan',
    RESPONSE_CODE_EXECUTION: 'response-code-execution',
    RESPONSE_CONTEXT: 'response-context',
} as const;

export type MessageCommand = typeof MessageCommands[keyof typeof MessageCommands];

