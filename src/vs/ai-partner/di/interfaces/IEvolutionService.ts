export interface AgentSuccessRecord {
    agentName: string;
    taskId: string;
    success: boolean;
    duration: number;
    tokensUsed?: number;
    error?: string;
    timestamp: string;
}

export interface IEvolutionService {
    /**
     * Records the outcome of an agent's execution.
     */
    recordExecution(record: AgentSuccessRecord): Promise<void>;

    /**
     * Analyzes failure patterns and proposes prompt enhancements.
     */
    proposeInstructionRefinement(agentName: string): Promise<string | null>;

    /**
     * Returns success rate metrics for an agent.
     */
    getMetrics(agentName: string): Promise<{ successRate: number; totalExecutions: number }>;
}
