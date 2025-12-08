/**
 * A2A Standard Message Types
 * 
 * This file defines the standard A2A (Agent-to-Agent) message structure
 * as per the A2A SDK specification.
 */

// ============================================================================
// Core A2A Message Types
// ============================================================================

export interface A2AMessage {
    kind: 'message';
    messageId?: string;
    role: 'user' | 'agent';
    parts: MessagePart[];
    contextId?: string;
}

export type MessagePart = 
    | TextPart
    | DataPart
    | ArtifactPart;

export interface TextPart {
    kind: 'text';
    text: string;
}

export interface DataPart {
    kind: 'data';
    mimeType: string;
    data: any;
}

export interface ArtifactPart {
    kind: 'artifact';
    artifactId: string;
    mimeType: string;
    data: any;
    description?: string;
}

// ============================================================================
// Standard MIME Types
// ============================================================================

export const A2A_MIME_TYPES = {
    // Progress and status updates
    PROGRESS: 'application/vnd.progress+json',
    
    // Planning and execution
    PLAN: 'application/vnd.plan+json',
    
    // File operations
    FILE_EDIT: 'application/vnd.file-edit+json',
    DIFF: 'application/vnd.diff+json',
    
    // Code quality
    LINT_SUMMARY: 'application/vnd.lint-summary+json',
    
    // Chat history and state
    HISTORY: 'application/vnd.history+json',
    
    // Settings and configuration
    LLM_SETTINGS: 'application/vnd.llm-settings+json',
    PROFILES: 'application/vnd.profiles+json',
    MODELS: 'application/vnd.models+json',
    SLASH_COMMANDS: 'application/vnd.slash-commands+json',
    
    // Clarification
    CLARIFICATION_REQUEST: 'application/vnd.clarification-request+json',
} as const;

export type A2AMimeType = typeof A2A_MIME_TYPES[keyof typeof A2A_MIME_TYPES];

// ============================================================================
// Domain-Specific Data Types
// ============================================================================

/**
 * Progress log data
 * Example: { text: "[CodeEditAgent] Creating file..." }
 */
export interface ProgressData {
    text: string;
    timestamp?: string;
    level?: 'info' | 'warning' | 'error';
}

/**
 * Execution plan data
 * Example: { steps: [{ description: "Step 1", status: "pending" }] }
 */
export interface PlanData {
    steps: Array<{
        description: string;
        status?: 'pending' | 'running' | 'completed' | 'failed';
    }>;
}

/**
 * File edit metadata
 * Example: { filePath: "src/foo.ts", suggestionType: "create" }
 */
export interface FileEditData {
    filePath: string;
    title: string;
    suggestionType: 'create' | 'modify';
    senderName?: string;
    timestamp?: string;
}

/**
 * Diff data for code changes
 */
export interface DiffData {
    filePath: string;
    diffHtml: string;
    originalCode: string;
    modifiedCode: string;
    title: string;
    suggestionType: string;
    addedLines?: number;
    removedLines?: number;
}

/**
 * Lint summary for a file
 */
export interface LintSummaryData {
    filePath: string;
    summary: string;
    errorCount?: number;
    warningCount?: number;
}

/**
 * Chat history message
 */
export interface HistoryData {
    messages: Array<{
        author: 'user' | 'agent';
        content: any[];
        thought?: string;
        senderName?: string;
        timestamp?: string;
        kind?: string;
        filePath?: string;
        title?: string;
        suggestionType?: string;
    }>;
}

/**
 * LLM settings
 */
export interface LLMSettingsData {
    llmProvider: 'openai' | 'ollama' | 'anthropic' | 'xai' | 'google' | 'groq' | 'openrouter';
    model: string;
    endpoint?: string;
}

/**
 * Profile data
 */
export interface ProfilesData {
    profiles: Array<{
        id: string;
        name: string;
        provider?: string;
        endpoint?: string;
        model?: string;
    }>;
    activeProfileId?: string;
}

/**
 * Available models
 */
export interface ModelsData {
    models: string[];
}

/**
 * Slash commands
 */
export interface SlashCommandsData {
    commands: Array<{
        command: string;
        description: string;
    }>;
}

/**
 * Clarification request data
 */
export interface ClarificationRequestData {
    question: string;
    context?: string; // Why I am asking
    options?: string[]; // Multiple choice options (optional)
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a standard A2A message with a data part
 */
export function createA2ADataMessage(
    mimeType: A2AMimeType,
    data: any,
    contextId?: string
): A2AMessage {
    return {
        kind: 'message',
        role: 'agent',
        parts: [{
            kind: 'data',
            mimeType,
            data
        }],
        contextId
    };
}

/**
 * Create a progress log message
 */
export function createProgressMessage(text: string, contextId?: string): A2AMessage {
    return createA2ADataMessage(
        A2A_MIME_TYPES.PROGRESS,
        { text, timestamp: new Date().toISOString() } as ProgressData,
        contextId
    );
}

/**
 * Create a plan message
 */
export function createPlanMessage(steps: PlanData['steps'], contextId?: string): A2AMessage {
    return createA2ADataMessage(
        A2A_MIME_TYPES.PLAN,
        { steps } as PlanData,
        contextId
    );
}

/**
 * Create a file edit message
 */
export function createFileEditMessage(data: FileEditData, contextId?: string): A2AMessage {
    return createA2ADataMessage(
        A2A_MIME_TYPES.FILE_EDIT,
        data,
        contextId
    );
}

/**
 * Create a clarification request message
 */
export function createClarificationRequestMessage(data: ClarificationRequestData, contextId?: string): A2AMessage {
    return createA2ADataMessage(
        A2A_MIME_TYPES.CLARIFICATION_REQUEST,
        data,
        contextId
    );
}
