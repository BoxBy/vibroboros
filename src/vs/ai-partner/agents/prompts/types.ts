export enum SystemPromptSection {
    AGENT_ROLE = 'AGENT_ROLE',
    RULES = 'RULES',
    TOOL_USE = 'TOOL_USE',
    OBJECTIVE = 'OBJECTIVE',
    SYSTEM_INFO = 'SYSTEM_INFO',
    MCP_INFO = 'MCP_INFO',
    USER_INSTRUCTIONS = 'USER_INSTRUCTIONS'
}

export interface SystemPromptContext {
    os: string;
    cwd: string;
    locale: string;
    modelFamily?: 'generic' | 'openai' | 'anthropic' | 'google' | 'ollama' | 'groq' | 'openrouter' | 'xai';
    capabilities: {
        mcpEnabled: boolean;
        browserEnabled: boolean;
        commandExecutionEnabled: boolean;
    };
    availableTools?: any[];
    workspaceRoots?: string[];
    provider?: any;
    model?: string;
    ideLanguage?: string;
    uroborosMode?: boolean;
}

export type PromptComponent = (context: SystemPromptContext) => string;

export interface PromptVariant {
    id: string;
    description: string;
    matcher: (context: SystemPromptContext) => boolean;
    baseTemplate: string;
    componentOrder: SystemPromptSection[];
}

export interface PromptConfig {
    variant?: PromptVariant;
    context?: Partial<SystemPromptContext>;
}
