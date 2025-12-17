export interface AgentSystemPromptOptions {
    agentName: string;
    agentList?: string; // Optional (Mainly for Orchestrator/Routing)
    complexity?: number; // Optional (Some agents might default or calculate differently)
    userPrefs: {
        language: string;
        codingStyle: string;
        preferredFrameworks: string[];
    };
    thinkingLang: string;
    userLang: string;
    projectContext?: string; // Optional
    creationTime: string;
    excludeHistory?: boolean; // For specialized tasks (e.g. Summarizer shouldn't see prompt history)
    targetContent?: string; // Content to operate on (e.g. History to summarize)
    dynamicRules?: string[]; // Dynamic rules injected by Agent Logic (e.g. line limits)
    examples?: string; // Dynamic examples injected by Agent Logic
}
