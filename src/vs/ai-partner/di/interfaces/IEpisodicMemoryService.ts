/**
 * Interface for Episodic Memory Service (Phase 9: Hybrid Memory)
 * Stores raw execution traces and manages uncertainty extraction.
 */

export interface MemoryEpisode {
    id: string;
    timestamp: string;
    agentName: string;
    contextId: string;
    taskId: string;
    userInput?: string; // What the user originally requested
    rawLog?: string; // The experiential trace (optional now)
    summary?: string; // The synthetic summary
    affectedAstSignatures?: string[]; // AST symbol names modified or referenced
    uncertaintyTraces: UncertaintyTrace[];
}

export interface UncertaintyTrace {
    marker: string; // e.g., "I'm assuming", "Not verified"
    content: string; // The context of the uncertainty
    score: number; // 0.0 to 1.0 (how uncertain)
}

export interface IEpisodicMemoryService {
    /**
     * Records a new execution episode.
     */
    recordEpisode(episode: Omit<MemoryEpisode, 'id' | 'timestamp' | 'uncertaintyTraces'>): Promise<string>;

    /**
     * Retrieves recent episodes for a specific context or task.
     */
    getRecentEpisodes(limit: number): Promise<MemoryEpisode[]>;

    /**
     * Extracts uncertainty traces from a raw log string.
     */
    extractUncertainty(rawLog: string): UncertaintyTrace[];

    /**
     * Generates a blended context (Raw + Summary) for prompt injection.
     * @param limit Maximum number of episodes to return.
     * @param agentName Filter by agent name (optional).
     * @param currentUserInput The current user prompt, used for Jaccard semantic matching.
     * @param currentAstSignatures The AST signatures relevant to the current task, used for structural matching.
     */
    getBlendedContext(limit: number, agentName?: string, currentUserInput?: string, currentAstSignatures?: string[]): Promise<string>;
}
