/**
 * Interface for Memory Service
 * Manages user preferences and session memory
 */

export interface UserPreferences {
    language: string;
    codingStyle: string;
    preferredFrameworks: string[];
    customInstructions: string;
    sessionStartTime?: string;
    [key: string]: any;
}

export interface IMemoryService {
    /**
     * Get the session start time
     */
    getSessionStartTime(): string;

    /**
     * Get user preferences
     */
    getPreferences(): Promise<UserPreferences>;

    /**
     * Save user preferences
     */
    savePreferences(preferences: UserPreferences): Promise<void>;
}
