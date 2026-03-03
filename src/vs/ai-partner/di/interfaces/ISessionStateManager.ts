/**
 * Interface for Session State Manager
 * Tracks the logical progress and goals of a specific session.
 */

export interface SessionGoal {
    description: string;
    targetFile?: string;
    successCriteria: string[];
    isMet: boolean;
}

export interface SessionMilestone {
    id: string;
    label: string;
    status: 'pending' | 'reached' | 'skipped';
    timestamp?: string;
}

export interface ISessionStateManager {
    /**
     * Sets the primary goal for the current session.
     */
    setGoal(goal: SessionGoal): void;

    /**
     * Gets the current session goal.
     */
    getGoal(): SessionGoal | undefined;

    /**
     * Adds or updates a milestone for the session.
     */
    addMilestone(milestone: SessionMilestone): void;

    /**
     * Gets all milestones for the current session.
     */
    getMilestones(): SessionMilestone[];

    /**
     * Marks a milestone as reached.
     */
    reachMilestone(id: string): void;

    /**
     * Resets the state manager for a new session.
     */
    reset(sessionId: string): void;

    /**
     * Persists the current state.
     */
    save(): Promise<void>;

    /**
     * Loads state for a specific session.
     */
    load(sessionId: string): Promise<void>;
}
