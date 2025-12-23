import * as vscode from 'vscode';
import { EventEmitter } from 'events';

// Types ported from OrchestratorAgent or shared definitions
export interface ChatMessage {
    author: 'user' | 'agent';
    content: any[];
    thought?: string;
    senderName?: string;
    timestamp?: string;
    kind?: 'progress' | 'normal' | 'uroboros-proposal' | 'task' | 'codeEditFile' | 'tool_trace';
    messageId?: string;
    filePath?: string;
    title?: string;
    suggestionType?: string;
    lintSummary?: string;
    buttons?: Array<{ label: string; command: string; payload?: any; style?: 'primary' | 'secondary' | 'danger' }>;
}

export interface SessionMetadata {
    id: string;
    title: string;
    createdAt: string;
    messageCount: number;
}

export interface SessionState {
    id: string;
    messages: ChatMessage[];
    tasks: any[]; 
    activeAgent?: string;
    isWorking: boolean;
    llmHistory: any[]; // LlmMessage type
}

export class SessionManager extends EventEmitter {
    private static readonly ACTIVE_SESSION_ID_KEY = 'aiPartnerActiveChatSessionId';
    private static readonly SESSIONS_INDEX_KEY = 'aiPartnerChatSessionsIndex';

    private static instance: SessionManager;
    private activeSessionId: string | undefined;
    private state: SessionState | undefined;

    constructor(private memento: vscode.Memento) {
        super();
        SessionManager.instance = this;
    }

    public static getInstance(): SessionManager {
        if (!SessionManager.instance) {
            throw new Error('SessionManager not initialized');
        }
        return SessionManager.instance;
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
        if (!this.state || !this.activeSessionId) {
            await this.createNewSession();
        }
        this.state!.messages.push(message);
        await this.saveCurrentState();
        
        // Update metadata message count
        await this.updateMessageCount(this.activeSessionId!, this.state!.messages.length);
        
        this.emit('messageAdded', message);
        this.emit('stateChanged', this.state);
    }

    public async updateTaskStatus(taskId: string, status: 'completed' | 'pending' | 'failed'): Promise<void> {
        if (!this.state) { return; }
        const task = this.state.tasks.find((t: any) => t.id === taskId);
        if (task) {
            task.status = status;
            await this.saveCurrentState();
            this.emit('taskUpdated', task);
            this.emit('stateChanged', this.state);
        }
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
