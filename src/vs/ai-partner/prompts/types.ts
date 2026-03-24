export interface AgentSystemPromptOptions {
    agentName: string;
    agentList?: string[] | string; // Flexibility for transition
    agentDescriptions?: string; // New: For persona awareness without breaking logic
    complexity?: number;
    userPrefs: {
        language: string;
        codingStyle: string;
        preferredFrameworks: string[];
    };
    thinkingLang: string;
    userLang: string;
    projectContext?: string; // Optional
    userInput?: string; // Optional (The actual task description)
    creationTime?: string;
    excludeHistory?: boolean; // For specialized tasks (e.g. Summarizer shouldn't see prompt history)
    targetContent?: string; // Content to operate on (e.g. History to summarize)
    dynamicRules?: string[]; // Dynamic rules injected by Agent Logic (e.g. line limits)
    examples?: string; // Dynamic examples injected by Agent Logic
    cwd?: string; // Working directory (Workspace root)
    metrics?: any; // New: For performance/token tracking
    isSubAgent?: boolean; // New: For sub-agent identity
    seniorIntuition?: string; // New: For Tier 5 automatic risk/history injection
}

