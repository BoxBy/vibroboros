/**
 * Interface for Session Manager
 * Manages chat sessions and their state
 */

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
    metadata?: { [key: string]: any };
    messageId?: string;
    author?: 'user' | 'agent';
    senderName?: string;
}

export interface TaskItem {
    id: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    assignedTo?: string;
    completedAt?: string;
}

export interface SessionMetadata {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    agentType?: string;
    messageCount?: number;
}

export interface SessionState {
    id?: string;
    messages: ChatMessage[];
    tasks: TaskItem[];
    context?: { [key: string]: any };
    llmHistory?: any[];
    activeAgent?: string;
    isWorking?: boolean;
}

export interface ISessionManager {
    /**
     * Get current session ID
     */
    getCurrentSessionId(): string | undefined;

    /**
     * Create a new session
     */
    createSession(title: string): string;

    /**
     * Get session state
     */
    getSessionState(sessionId: string): SessionState | undefined;

    /**
     * Get current session state
     */
    getState(): SessionState | undefined;

    /**
     * Update session state
     */
    updateSessionState(sessionId: string, state: Partial<SessionState>): void;

    /**
     * Delete a session
     */
    deleteSession(sessionId: string): void;

    /**
     * List all sessions
     */
    listSessions(): SessionMetadata[];

    /**
     * Add a message to the session
     */
    addMessage(sessionId: string, message: ChatMessage): void;

    /**
     * Get messages for a session
     */
    getMessages(sessionId: string): ChatMessage[];

    /**
     * Update messages
     */
    updateMessages(messages: ChatMessage[]): void;
}
