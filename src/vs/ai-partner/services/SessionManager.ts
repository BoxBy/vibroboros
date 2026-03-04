import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import type { ISessionManager, ChatMessage, TaskItem, SessionMetadata, SessionState } from '../di/interfaces/ISessionManager';

// Re-export types for backward compatibility
export type { ChatMessage, TaskItem, SessionMetadata, SessionState };

/**
 * Session Manager
 *
 * Manages chat sessions, messages, and tasks.
 * Extends EventEmitter to emit session change events.
 * Now uses dependency injection instead of static singleton pattern.
 *
 * Note: SessionManager still maintains a singleton pattern via the instance
 * property set in constructor, but this is managed through the DI container.
 */
export class SessionManager extends EventEmitter implements ISessionManager {
    private static readonly ACTIVE_SESSION_ID_KEY = 'aiPartnerActiveChatSessionId';
    private static readonly SESSIONS_INDEX_KEY = 'aiPartnerChatSessionsIndex';

    private static instance: SessionManager;
    private activeSessionId: string | undefined;
    private state: SessionState | undefined;
    private sessionCreationAllowed: boolean = true; // Controls whether new sessions can be created

    constructor(private memento: vscode.Memento) {
        super();
        // Set the singleton instance (required for backward compatibility)
        SessionManager.instance = this;
    }

    /**
     * @deprecated Use dependency injection instead
     * This method is kept for backward compatibility during migration
     */
    public static getInstance(): SessionManager {
        if (!SessionManager.instance) {
            throw new Error('SessionManager not initialized. Use DI to create an instance.');
        }
        return SessionManager.instance;
    }

    /**
     * Internal setter for the singleton instance (used by DI container)
     * @internal
     */
    public static setInstance(instance: SessionManager): void {
        SessionManager.instance = instance;
    }

    /**
     * Allow or disallow session creation.
     * When false, createNewSession() and addMessage() will throw errors.
     * This is used to ensure only WelcomeScreen can create new sessions.
     */
    public setSessionCreationAllowed(allowed: boolean): void {
        this.sessionCreationAllowed = allowed;
    }

    /**
     * Check if session creation is currently allowed.
     */
    public isSessionCreationAllowed(): boolean {
        return this.sessionCreationAllowed;
    }

    public async initialize(): Promise<void> {
        let activeId = this.memento.get<string>(SessionManager.ACTIVE_SESSION_ID_KEY, '');
        let sessions = this.memento.get<SessionMetadata[]>(SessionManager.SESSIONS_INDEX_KEY, []) || [];

        if (sessions.length === 0) {
            await this.createNewSession();
        } else if (!activeId || !sessions.find(s => s.id === activeId)) {
            // Restore last session if activeId is invalid
            activeId = sessions[sessions.length - 1].id;
            await this.switchSession(activeId);
        } else {
            await this.switchSession(activeId);
        }
    }

    public async createNewSession(initialTitle?: string): Promise<string> {
        // Check if session creation is allowed
        if (!this.sessionCreationAllowed) {
            throw new Error('Session creation is not allowed at this time. Only WelcomeScreen can create new sessions.');
        }

        const now = new Date();
        const id = `session-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
        const title = initialTitle || `Chat ${now.toLocaleString()}`;

        const metadata: SessionMetadata = { id, title, createdAt: now.toISOString(), messageCount: 0 };
        const sessions = this.memento.get<SessionMetadata[]>(SessionManager.SESSIONS_INDEX_KEY, []) || [];
        sessions.push(metadata);
        await this.memento.update(SessionManager.SESSIONS_INDEX_KEY, sessions);

        // Initialize state for new session
        const newState: SessionState = {
            id,
            messages: [],
            tasks: [],
            isWorking: false,
            llmHistory: []
        };
        await this.persistSessionState(id, newState);
        await this.switchSession(id);

        return id;
    }

    public async switchSession(id: string): Promise<void> {
        const sessions = this.memento.get<SessionMetadata[]>(SessionManager.SESSIONS_INDEX_KEY, []) || [];
        if (!sessions.find(s => s.id === id)) {
            throw new Error(`Session ${id} not found`);
        }

        this.activeSessionId = id;
        this.state = await this.loadSessionState(id);
        await this.memento.update(SessionManager.ACTIVE_SESSION_ID_KEY, id);
        
        this.emit('sessionChanged', { activeId: id, state: this.state });
        this.emit('stateChanged', this.state);
    }

    public async clearActiveSession(): Promise<void> {
        this.activeSessionId = undefined;
        this.state = undefined;
        await this.memento.update(SessionManager.ACTIVE_SESSION_ID_KEY, undefined);
        // Do not emit sessionCleared here as it might trigger unwanted UI resets if not handled carefully
        // Just clearing internal state
    }

    public async deleteSession(id: string): Promise<void> {
        let sessions = this.memento.get<SessionMetadata[]>(SessionManager.SESSIONS_INDEX_KEY, []) || [];
        sessions = sessions.filter(s => s.id !== id);
        await this.memento.update(SessionManager.SESSIONS_INDEX_KEY, sessions);
        
        // Remove persistence
        await this.memento.update(this.getSessionStateKey(id), undefined);

        if (this.activeSessionId === id) {
            if (sessions.length > 0) {
                await this.switchSession(sessions[sessions.length - 1].id);
            } else {
                // No sessions left -> Clear state, wait for creation
                this.activeSessionId = undefined;
                this.state = undefined;
                await this.memento.update(SessionManager.ACTIVE_SESSION_ID_KEY, undefined);
                this.emit('sessionCleared'); // UI should show welcome screen or auto-create
            }
        } else {
            // Just notify update list
            this.emit('sessionListUpdated', sessions);
        }
    }

    public async addMessage(message: ChatMessage): Promise<void> {
        await this.addMessageToSession(this.activeSessionId || '', message);
    }

    public async addMessageToSession(sessionId: string, message: ChatMessage): Promise<void> {
        let stateToUpdate = this.state;
        let targetId = sessionId || this.activeSessionId;

        if (!targetId && !this.sessionCreationAllowed) {
            throw new Error('No active session and session creation is disallowed.');
        }

        if (!targetId) {
            targetId = await this.createNewSession();
            stateToUpdate = this.state;
        }

        if (this.activeSessionId === targetId && this.state) {
            this.state.messages.push(message);
            await this.saveCurrentState();
            await this.updateMessageCount(targetId, this.state.messages.length);
            this.emit('messageAdded', message);
            this.emit('stateChanged', this.state);
        } else {
            // Background session update
            const state = await this.loadSessionState(targetId);
            state.messages.push(message);
            await this.persistSessionState(targetId, state);
            await this.updateMessageCount(targetId, state.messages.length);
            // Optionally emit sessionListUpdated if count changed
        }
    }

    public async updateTaskStatus(taskId: string, status: 'completed' | 'pending' | 'failed' | 'in_progress'): Promise<void> {
        if (!this.state) { return; }
        const task = this.state.tasks.find((t: TaskItem) => t.id === taskId);
        if (task) {
            task.status = status;
            if (status === 'completed') {
                task.completedAt = new Date().toISOString();
            }
            await this.saveCurrentState();
            this.emit('taskUpdated', task);
            this.emit('stateChanged', this.state);
        }
    }

    public async addTasks(tasks: Array<{ id?: string; description: string; status?: TaskItem['status'] }>): Promise<void> {
        if (!this.state) { return; }
        const now = new Date().toISOString();
        const newTasks: TaskItem[] = tasks.map(t => ({
            id: t.id || `task-${now}-${Math.random().toString(36).slice(2, 8)}`,
            description: t.description,
            status: t.status || 'pending',
            createdAt: now
        }));

        // Merge with existing tasks (avoid duplicates by description)
        const existingDescriptions = new Set(this.state.tasks.map(t => t.description));
        const uniqueNewTasks = newTasks.filter(t => !existingDescriptions.has(t.description));

        this.state.tasks = [...this.state.tasks, ...uniqueNewTasks];
        await this.saveCurrentState();
        this.emit('tasksUpdated', this.state.tasks);
        this.emit('stateChanged', this.state);
    }

    public getTasks(): TaskItem[] {
        return this.state?.tasks || [];
    }

    public getSessions(): SessionMetadata[] {
        return this.memento.get<SessionMetadata[]>(SessionManager.SESSIONS_INDEX_KEY, []) || [];
    }

    public getState(): SessionState | undefined {
        return this.state;
    }

    public getActiveSessionId(): string | undefined {
        return this.activeSessionId;
    }

    // --- Persistence Helpers ---

    private getSessionStateKey(id: string): string {
        return `session_state_${id}`;
    }

    private async loadSessionState(id: string): Promise<SessionState> {
        // Fallback for migration: try legacy keys if new key missing (omitted for brevity in this plan V2, assuming clean start or simple migration)
        // For robustness, let's implement basic load:
        const key = this.getSessionStateKey(id);
        const data = this.memento.get<SessionState>(key);
        if (data) { return data; }

        // Legacy/Empty fallback
        return {
            id,
            messages: [],
            tasks: [],
            isWorking: false,
            llmHistory: []
        };
    }

    private async persistSessionState(id: string, state: SessionState): Promise<void> {
        await this.memento.update(this.getSessionStateKey(id), state);
    }

    private async saveCurrentState() {
        if (this.activeSessionId && this.state) {
            await this.persistSessionState(this.activeSessionId, this.state);
        }
    }

    public async overwriteMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
        if (!this.state || this.state.id !== sessionId) {
            // If active, update state
            if (this.activeSessionId === sessionId) {
                 this.state!.messages = messages;
                 await this.saveCurrentState();
            } else {
                // Load, update, persist
                const state = await this.loadSessionState(sessionId);
                state.messages = messages;
                await this.persistSessionState(sessionId, state);
            }
        } else {
             this.state.messages = messages;
             await this.saveCurrentState();
        }
        
        // Update metadata count
        await this.updateMessageCount(sessionId, messages.length);
        
        if (this.activeSessionId === sessionId) {
            this.emit('stateChanged', this.state);
        }
    }

    public async updateLlmHistory(history: any[]): Promise<void> {
        if (!this.state) { return; }
        this.state.llmHistory = history;
        await this.saveCurrentState();
        // this.emit('stateChanged', this.state); // Optional, if UI needs LLM history
    }

    public async updateSessionTitle(id: string, title: string): Promise<void> {
        const sessions = this.getSessions();
        const sess = sessions.find(s => s.id === id);
        if (sess) {
            sess.title = title;
            await this.memento.update(SessionManager.SESSIONS_INDEX_KEY, sessions);
            this.emit('sessionListUpdated', sessions);
        }
    }

    // Initialize logic for existing sessions logic fix
    private async updateMessageCount(id: string, count: number) {
        const sessions = this.getSessions();
        const sess = sessions.find(s => s.id === id);
        if (sess) {
            sess.messageCount = count;
            await this.memento.update(SessionManager.SESSIONS_INDEX_KEY, sessions);
            this.emit('sessionListUpdated', sessions);
        }
    }
}
