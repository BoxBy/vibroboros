import { SystemPromptFactory } from '../services/SystemPromptFactory';
import * as vscode from 'vscode';
import { getPlanCompletionSummaryPrompt } from '../prompts/sections/Summary';



import * as fs from 'fs/promises';
import * as path from 'path';

import { A2AMessage } from '../interfaces/A2AMessage';
import { AgentCard } from '@a2a-js/sdk';
import { RequestContext, ExecutionEventBus } from '@a2a-js/sdk/server';
import { BaseAgent } from './core/BaseAgent';
import { UIMessageFactory } from '../messaging/UIMessageFactory';

import * as mcpServerModule from '@modelcontextprotocol/sdk/server';
import { LLMService, LlmMessage } from '../services/LLMService';
import { AuthService } from '../auth_service';
import { ConfigService } from '../config_service';
import { DeveloperLogService } from '../services/DeveloperLogService';
import * as diff from 'diff';
import { getMcpClient } from '../mcp_client_provider';
import { ExecuteCommandTool } from '../tools/ExecuteCommandTool';

import { v4 as uuidv4 } from 'uuid';
import { AgentNames } from './utils/AgentConstants';
import { CheckpointService } from '../services/CheckpointService';
import { ContextService } from '../services/ContextService';
import { messages as AgentMessages } from '../messages';
import { SessionManager } from '../services/SessionManager';
// import { IntentRouter } from '../core/IntentRouter'; // Removed

export interface RuntimeExecutionStep {
    id: string;
    description: string;
    status: 'pending' | 'in-progress' | 'completed' | 'error';
    executionId?: string;
    retryCount?: number;
    phase?: string;
    targetAgent?: string;
}


// --- Type Definitions ---
interface ChatMessage {
    author: 'user' | 'agent';
    content: any[];
    thought?: string;
    senderName?: string;
    timestamp?: string;
    kind?: 'progress' | 'normal' | 'uroboros-proposal' | 'task' | 'codeEditFile' | 'tool_trace';
    contextId?: string;
    messageId?: string;
    hidden?: boolean;
    // ... other props used in logic
    userMessage?: string;
    summary?: string;
    lintSummary?: string;
    buttons?: Array<{ label: string; command: string; payload?: any; style?: 'primary' | 'secondary' | 'danger' }>;
    filePath?: string;
    title?: string;
    suggestionType?: string;
}

const SLASH_COMMANDS = [
    { command: '/test health', description: 'Run a health check on all specialist agents.' },
    { command: '/test diff', description: 'Test the diff UI.' },
    { command: '/test mcp', description: 'List available MCP tools.' },
    { command: '/clear', description: 'Clear the current session chat history.' },
    { command: '/help', description: 'Show this list of available commands.' }
];

/**
 * @class OrchestratorAgent
 * @description The master agent that coordinates all other agents and services.
 */
export class OrchestratorAgent extends BaseAgent {
	private static readonly AGENT_ID = 'OrchestratorAgent';
    private static instance: OrchestratorAgent;

    // --- Static Keys ---
    public static readonly SPECIALIST_AGENTS: { name: string; description: string }[] = [
        { name: 'CodeEditAgent', description: 'Coding & Implementation' },
        { name: 'TaskDecompositionAgent', description: 'Task Breakdown' },
        { name: 'BrainstormAgent', description: 'Planning & Architecture' },
        { name: 'TestGenerationAgent', description: 'Testing' },
        { name: 'DocumentationGenerationAgent', description: 'Documentation' },
        { name: 'BugFixAgent', description: 'Deep Debugging & Root Cause' },
        { name: 'ReadmeGenerationAgent', description: 'README Management' },
        { name: 'ContextManagementAgent', description: 'Context Optimization' }
    ]; 
    private static readonly SESSIONS_INDEX_KEY = 'orchestrator.sessions.index';
    private static readonly ACTIVE_SESSION_ID_KEY = 'orchestrator.sessions.activeId';
    
    // --- Services ---
    private authService: AuthService;
    private mcpServer: mcpServerModule.Server;
    // BaseAgent has llmService, configService, etc. but Orchestrator declares them private. 
    // BaseAgent declares them protected. 
    // Typescript might complain if they are redefined with different visibility.
    // BaseAgent: protected llmService: LLMService;
    // Orchestrator: private llmService: LLMService; -> This is valid if Orchestrator overrides usage, but cleaner to remove re-declaration if possible.
    // However, BaseAgent's llmService is set in constructor?
    private checkpointService: CheckpointService;
    private sessionManager: SessionManager;
    private contextService: ContextService;

    
    // --- Core Logic ---
    private state: vscode.Memento;
    private diagnosticCollection: vscode.DiagnosticCollection;

    // --- State ---
    private planId: string = uuidv4();
    private currentPlan: RuntimeExecutionStep[] = [];
    private currentStepIndex: number = -1;
    private isAwaitingPlanConfirmation: boolean = false;
    private pendingPlan: RuntimeExecutionStep[] | null = null;
    
    // --- Execution Tracking & Flags ---
    private lastContextFilePath: string = '';
    private lastAppliedFilePath: string = '';
    private lastSourceFilePath: string = '';
    private suppressPostActionsSuggestions: boolean = false;
    private pendingPostActions: string[] = [];
    private isAwaitingPostActionsConfirmation: boolean = false;
    private lastPlanSummary: string = '';
    private retriedSteps: Set<string> = new Set();
    private deferredPostActions: string[] = [];
    private llmConversationHistory: LlmMessage[] = []; // Context for LLM
    private isSendingPlanSummary: boolean = false;
    private producedArtifacts: Map<string, 'created' | 'updated'> = new Map();
    private isCompletingPlan: boolean = false;
    private isCancellationRequested: boolean = false;
    private autonomousMode: boolean = false; 
    private recentlyAppliedFiles: Map<string, number> = new Map();
    private lastUserInputAt: number = 0;
    
    private externalAgents: Map<string, { name: string; description: string; url: string }> = new Map();
    private _specialistAgentDescriptions: string = '';

    // --- Session & History ---
    private activeSessionId: string = "default-session";
    private handledExecutions: Set<string> = new Set();
    protected outputFormat: 'json' | 'text' = 'json'; // Orchestrator handles its own JSON parsing/planning logic
    
    private chatHistory: ChatMessage[] = []; 
    
    // --- Preferences ---
    private isAcceptAlwaysActive: boolean = false;
    private alwaysAcceptSuggestions: Set<string> = new Set();
    private sessionSuppressComplexityPrompt: boolean = false;
    
    // --- Uroboros (Legacy/Fallback) ---
    private pendingUroborosProposal: { userText: string; steps?: string[] } | null = null;
    private declinedUroborosQueries: Set<string> = new Set();
    
    // --- Execution Details ---
    private planKind: string = '';
    private hasExecutedCoreFollowups: boolean = false;
    private currentExecutionId: string = ''; 

    // --- Message Dispatch & Events ---
    private readonly _onDidPostMessage = new vscode.EventEmitter<any>();
    public readonly onDidPostMessage = this._onDidPostMessage.event;
    private dispatch: (message: A2AMessage<any>) => Promise<void>;

    // --- State helpers ---
    private lastUserQuery: string = '';
    private brainstormContextId: string = '';
    private stickyAgentName: string = '';
    private stickyExpiresAt: number = 0;
    private lastImageAttachments: any[] = [];
    private lastAttachmentFilePaths: string[] = [];
    private lastDispatchedStep: string = '';
    private lastDispatchedAt: number = 0;
    private recentStructuredMessages: any[] = [];
    private recentQueryDebounce: Set<string> = new Set();
    
    // --- External Agents ---


    constructor(
		dispatch: (message: A2AMessage<any>) => Promise<void>,
		mcpServer: mcpServerModule.Server,
		protected llmService: LLMService,
		authService: AuthService,
		protected configService: ConfigService,
		state: vscode.Memento,
		diagnosticCollection: vscode.DiagnosticCollection,
		protected developerLogService: DeveloperLogService,
		externalAgents?: Map<string, { name: string; description: string; url: string }>
	) {
        super({ 
            name: 'OrchestratorAgent', 
            description: 'The master agent that coordinates all other agents and services.' 
        } as any);
        // Intercept dispatch to catch 'unknown' agents globally
        this.dispatch = async (message: any) => {
            if (message.recipient === 'unknown' || message.recipient?.toLowerCase() === 'unknown') {
                this.developerLogService.log(`[OrchestratorAgent] HARD INTERCEPT: Invalid target 'unknown'. Redirecting to BrainstormAgent.`);
                message.recipient = 'BrainstormAgent';
            }
            return dispatch(message);
        };
		this.mcpServer = mcpServer;
		this.llmService = llmService;
		this.authService = authService;
		this.configService = configService;
		this.state = state;
		this.diagnosticCollection = diagnosticCollection;
		this.developerLogService = developerLogService;
        this.checkpointService = new CheckpointService();
        this.contextService = new ContextService();
        this.sessionManager = new SessionManager(state);
        
        // --- External Agents ---
        if (externalAgents) {
            this.externalAgents = externalAgents;
        }
        
        OrchestratorAgent.instance = this;
	}

    public static getInstance(llmService?: LLMService, configService?: ConfigService, viewProvider?: any, context?: vscode.ExtensionContext): OrchestratorAgent {
        if (!OrchestratorAgent.instance) {
            throw new Error('OrchestratorAgent not initialized. It must be created via extension activation first.');
        }
        return OrchestratorAgent.instance;
    }

    // --- Prompt Generation ---
    protected async getSystemPrompt(userInput: string, requestContext: RequestContext): Promise<string> {
        console.log('[OrchestratorAgent] getSystemPrompt: Starting...');
        // Use SystemPromptFactory with 'router' role.
        let prompt = await SystemPromptFactory.generate('router', OrchestratorAgent.AGENT_ID, 3); // Default complexity 3 (Caution)
        console.log('[OrchestratorAgent] getSystemPrompt: SystemPromptFactory returned.');
        
        // Inject Chat History
        const historyText = this.getFormattedHistory();
        console.log('[OrchestratorAgent] getSystemPrompt: History formatted.');
        
        prompt = prompt.replace('[...System injects recent Conversation History here...]', historyText);
        console.log('[OrchestratorAgent] getSystemPrompt: Returning prompt.');
        
        return prompt;
    }

    protected async onLoopComplete(messages: any[]): Promise<void> {
        // Filter for Tool Calls and Tool Results (Intermediate steps usually lost)
        const trace = messages.filter(m => 
            m.role === 'tool' || 
            (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0)
        );

        for (const msg of trace) {
            await this.addMessageToHistory({
                author: 'agent',
                senderName: 'System',
                kind: 'tool_trace',
                content: [{ type: 'text', text: JSON.stringify(msg) }],
                timestamp: new Date().toISOString()
            } as any);
        }
    }

    private getFormattedHistory(): string {
        if (!this.chatHistory || this.chatHistory.length === 0) {
            return "No previous history.";
        }
        
        // Take last 10 turns to save context window
        const recent = this.chatHistory.slice(-15); // Increased context slightly
        return recent.map(msg => {
            const sender = msg.senderName || (msg.author === 'user' ? 'User' : 'Viper');
            
            // Handle Tool Traces (Hidden Memory)
            if (msg.kind === 'tool_trace') {
                try {
                    const contentStr = Array.isArray(msg.content) ? msg.content[0].text : String(msg.content);
                    const raw = JSON.parse(contentStr);
                    
                    if (raw.role === 'tool') {
                        // Truncate tool output to save tokens, but keep enough to verify success
                        const output = raw.content.length > 200 ? raw.content.substring(0, 200) + '...' : raw.content;
                        return `[Tool Result] ${raw.name || 'Unknown'}: ${output}`;
                    }
                    if (raw.role === 'assistant' && raw.tool_calls) {
                        const calls = raw.tool_calls.map((t: any) => `${t.function.name}(${t.function.arguments})`).join(', ');
                        return `[Tool Call] ${calls}`;
                    }
                } catch (e) { return ''; }
            }

            // Simplified text extraction for normal messages
            let text = '';
            if (Array.isArray(msg.content)) {
                text = msg.content.map(c => c.text || JSON.stringify(c)).join(' ');
            } else {
                text = String(msg.content);
            }
            // Truncate very long messages
            if (text.length > 500) text = text.substring(0, 500) + '... (truncated)';
            
            return `**${sender}**: ${text}`;
        }).filter(line => line.trim() !== '').join('\n\n');
    }

    /**
     * Dual-Channel A2A Dispatch
     * Sends complexity via METADATA (primary) and TEXT (fallback).
     */
    private async sendDualChannelMessage(targetAgent: string, text: string, complexity: number, contextId?: string, correlation?: any): Promise<void> {
        if (!targetAgent || targetAgent.toLowerCase() === 'unknown') {
            this.developerLogService.log(`[Orchestrator] Invalid target agent '${targetAgent}'. Fallback to BrainstormAgent.`);
            targetAgent = 'BrainstormAgent';
            text = `[Redirection from Invalid Target] ${text}`;
        }

        const { v4: uuidv4 } = require('uuid');
        
        // 1. Fallback Text Append
        const fallbackInstruction = `\n\n[SYSTEM INSTRUCTION: This task is assigned Complexity Level ${complexity}. Execute accordingly.]`;
        const contentWithFallback = text + fallbackInstruction;

        // 2. Metadata Payload
        const messageVal = {
            messageId: uuidv4(),
            sender: OrchestratorAgent.AGENT_ID,
            recipient: targetAgent,
            timestamp: new Date().toISOString(),
            contextId: contextId || uuidv4(),
            parts: [
                { kind: 'text', text: contentWithFallback },
                { 
                    kind: 'data', 
                    mimeType: 'application/vnd.a2a+json', 
                    data: {
                        task: text, // Raw task
                        complexity: complexity, // Primary Channel
                        correlation: correlation
                    }
                }
            ]
        };
        
        await this.dispatch(messageVal as any);
    }

    public async initialize(registeredAgentConfigs: { name: string; description: string; }[]): Promise<void> {
        await this.sessionManager.initialize();
        
        // Sync Orchestrator local state proxies with SessionManager
        this.syncWithSessionManager();

        this.sessionManager.on('stateChanged', () => this.syncWithSessionManager());
        this.sessionManager.on('sessionChanged', () => this.handleSessionChangeProxy());
        
        if (OrchestratorAgent.SPECIALIST_AGENTS.length === 0) {
            OrchestratorAgent.SPECIALIST_AGENTS.push(...registeredAgentConfigs.filter(a => { return a.name !== OrchestratorAgent.AGENT_ID; }));
        }
        this._specialistAgentDescriptions = OrchestratorAgent.SPECIALIST_AGENTS.map(agent => `- ${agent.name}: ${agent.description}`).join('\n');
    }

    private syncWithSessionManager() {
        const state = this.sessionManager.getState();
        if (state) {
            this.activeSessionId = state.id;
            this.chatHistory = state.messages;
            this.llmConversationHistory = state.llmHistory;
        }
    }

    private async sendFullSettingsToUI(): Promise<void> {
        try {
            const provider = this.configService.getLlmProvider();
            const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
            const uroborosEnabled = (this.configService as any).getUroborosMode ? (this.configService as any).getUroborosMode() : false;
            const profiles = this.configService.getLlmProfiles();
            const activeProfileId = this.configService.getActiveProfileId();

            this._onDidPostMessage.fire({ 
                command: 'llmSettingsResponse', 
                payload: { llmProvider: provider, model: model } 
            });

            this._onDidPostMessage.fire({
                command: 'setAutonomousMode',
                payload: { enabled: this.autonomousMode }
            });

            this._onDidPostMessage.fire({
                command: 'profilesResponse',
                payload: { profiles, activeProfileId, uroborosEnabled }
            });
        } catch (error) {
            console.error('[OrchestratorAgent] Error sending settings to UI:', error);
        }
    }

    // Proxy method to maintain compatibility with existing logic, but triggered by SessionManager events
    private async handleSessionChangeProxy(): Promise<void> {
        await this.sendFullSettingsToUI();
        const sessions = this.sessionManager.getSessions();
        const activeId = this.sessionManager.getActiveSessionId();
        
        this._onDidPostMessage.fire({ command: 'historyList', payload: { sessions, activeId } });
        
        // Sanitize chat history (kept from original logic for safety)
        const safeHistory = this.safeSanitizeHistory(this.chatHistory);
        this._onDidPostMessage.fire({ command: 'loadHistory', payload: safeHistory });
    }

    private safeSanitizeHistory(history: ChatMessage[]): any[] {
         return (history || []).map(msg => {
            if (!msg || typeof msg !== 'object') { return null; }
            let content = Array.isArray(msg.content) ? msg.content : [];
            content = content.map((c: any) => {
                if (!c || typeof c !== 'object') { return null; }
                if (c.type === 'text') {
                    return { ...c, text: typeof c.text === 'string' ? c.text : '' };
                }
                return c;
            }).filter((c: any) => c !== null);

            return {
                ...msg,
                messageId: msg.messageId,
                senderName: typeof msg.senderName === 'string' ? msg.senderName : (msg.author === 'user' ? 'User' : 'Viper'),
                author: typeof msg.author === 'string' ? msg.author : 'agent',
                content: content,
                timestamp: (msg.timestamp && !isNaN(new Date(msg.timestamp).getTime())) ? msg.timestamp : new Date().toISOString(),
                kind: typeof msg.kind === 'string' ? msg.kind : undefined,
                filePath: typeof msg.filePath === 'string' ? msg.filePath : undefined,
                title: typeof msg.title === 'string' ? msg.title : undefined,
                suggestionType: typeof msg.suggestionType === 'string' ? msg.suggestionType : undefined,
                lintSummary: typeof msg.lintSummary === 'string' ? msg.lintSummary : undefined,
                diff: (msg as any).diff
            };
        }).filter(msg => msg !== null);
    }

    // handleSessionChange logic moved to handleSessionChangeProxy and SessionManager

    private processProgressLog(msg: string, sender: string, sessionId: string = this.activeSessionId): void {
        // SDK standard: status-update messages are always shown as progress logs
        // No filtering needed - all status-update messages should be displayed
        if (!msg || !msg.trim()) {
            return;
        }

        // Show as progress log
        let displayMsg = msg;
        if (!displayMsg.includes('[MCP]') && sender && sender !== 'OrchestratorAgent' && sender !== 'System') {
            // Strip 'Agent' suffix if present (e.g. CodeEditAgent -> CodeEdit)
            const senderName = sender.replace(/Agent$/, '');
            // Only prepend if not already prefixed
            if (!displayMsg.startsWith(`[${senderName}]`)) {
                displayMsg = `[${senderName}] ${displayMsg}`;
            }
        }
        this.postMessageToSession(sessionId, 'progressLog', { text: displayMsg });

        // Persist progress log to chat history so it survives reloads
        const historyMsg: ChatMessage = {
            author: 'agent',
            content: [{ type: 'text', text: msg }],
            senderName: (msg.match(/^\[([^\]]+)/)?.[1]) || sender,
            timestamp: new Date().toISOString(),
            kind: 'progress'
        } as any;
        
        // Use addMessageToHistory which now safely handles progress logs (skips LLM context)
        this.addMessageToHistory(historyMsg).catch(err => {
             console.warn('[OrchestratorAgent] Failed to persist progress log history entry', err);
        });
    }

    private processProgressLogChunk(msg: string, _sender: string, sessionId: string = this.activeSessionId): void {
        if (!msg) {
            return;
        }
        this.postMessageToSession(sessionId, 'progressLogChunk', { text: msg });
    }



    public async acceptMessage(message: { type: string; from: string; text: string; contextId?: string; attachments?: any[]; messageId?: string }): Promise<void> {
        // console.log(`[OrchestratorAgent] acceptMessage:`, message);
        if (message.contextId === 'new-chat-session') {
            await this.handleUIMessage({ 
                command: 'newChat', 
                initialQuery: message.text,
                messageId: message.messageId // Pass explicit ID if available
            });
        } else {
             // Treat as normal chat message
             // FIX: Map to 'userQuery' command which handleUIMessage expects, and use 'query' instead of 'text'
             await this.handleUIMessage({ 
                 command: 'userQuery', 
                 query: message.text, 
                 attachments: message.attachments,
                 messageId: message.messageId || uuidv4() // Use provided ID or generate new
             });
        }
    }

    public async handleUIMessage(message: any): Promise<void> {
        // console.log(`[${OrchestratorAgent.AGENT_ID}] Received message from ViewProvider:`, message);

        try {
            switch (message.command) {
                case 'loadInitialData':
                    // Send current settings and history to UI on initial load
                    await this.handleSessionChangeProxy();
                    break;
                case 'requestHistory':
                    // Explicit history reload request from UI
                    // Only send list, do not force load messages (prevent auto-navigation)
                    const sessions = this.sessionManager.getSessions();
                    const activeId = this.sessionManager.getActiveSessionId();
                    this._onDidPostMessage.fire({ command: 'historyList', payload: { sessions, activeId } });
                    break;
            case 'newChat': {
                try {
                    await this.sessionManager.createNewSession();
                    this.sessionSuppressComplexityPrompt = false;
                    this.declinedUroborosQueries.clear();
                    
                    // Reset Execution State
                    this.currentPlan = [];
                    this.pendingPlan = null;
                    this.planKind = '';
                    this.hasExecutedCoreFollowups = false;
                    this.lastPlanSummary = '';
                    this.isAwaitingPlanConfirmation = false;
                    this.isAwaitingPostActionsConfirmation = false;
                    this.pendingPostActions = [];
                    this.autonomousMode = false;
                    this.pendingUroborosProposal = null;
                    this.lastAttachmentFilePaths = [];
                    this.lastImageAttachments = [];
                    this.isAcceptAlwaysActive = false;
                    this.alwaysAcceptSuggestions.clear();
                    
                    if (this.contextService) {
                        this.contextService.resetContext();
                    }

                    if (message.initialQuery) {
                        const query = message.initialQuery.trim();
                        if (query) {
                            await this.handleChatAndSpecialistCommands(query, message.messageId);
                             // Force update title based on initial query
                             // Ensure we have latest state before summarizing
                             try {
                                const state = this.sessionManager.getState();
                                if (state) { this.chatHistory = state.messages; }
                                await this.updateSessionTitleSummary();
                             } catch (err) {
                                this.developerLogService.log(`[OrchestratorAgent] Failed to update title: ${err}`);
                             }
                        }
                    }
                    this.developerLogService.log(`[OrchestratorAgent] Created new chat session via SessionManager.`);
                } catch (e: any) {
                    this.developerLogService.log(`[OrchestratorAgent] Failed to create new chat session: ${e?.message || e}`);
                }
                break;
            }
            case 'selectChat': {
                try {
                    const targetId = typeof message.sessionId === 'string' ? message.sessionId : '';
                    if (!targetId) { break; }
                    
                    await this.sessionManager.switchSession(targetId);
                    
                    this.alwaysAcceptSuggestions = new Set();
                    this.isAcceptAlwaysActive = false;
                    this.sessionSuppressComplexityPrompt = false;
                    this.declinedUroborosQueries.clear();
                    
                    this.developerLogService.log(`[OrchestratorAgent] Switched active chat session to ${targetId}.`);
                } catch (e: any) {
                    this.developerLogService.log(`[OrchestratorAgent] Failed to switch chat session: ${e?.message || e}`);
                }
                break;
            }
            case 'deleteChat': {
                try {
                    const targetId = typeof message.sessionId === 'string' ? message.sessionId : this.activeSessionId;
                    await this.sessionManager.deleteSession(targetId);
                    
                    const sessions = this.sessionManager.getSessions();
                    const activeId = this.sessionManager.getActiveSessionId();
                    
                    this._onDidPostMessage.fire({ 
                        command: 'historyList', 
                        payload: { sessions, activeId } 
                    });
                    
                    if (activeId) {
                         await this.handleSessionChangeProxy();
                    } else {
                        // All sessions deleted
                        this.chatHistory = [];
                        this.llmConversationHistory = [];
                        this._onDidPostMessage.fire({ command: 'clearChat' });
                    }

                    this.developerLogService.log(`[viper][OrchestratorAgent] Deleted chat session ${targetId}.`);
                } catch (e: any) {
                    this.developerLogService.log(`[viper][OrchestratorAgent] Failed to delete chat session: ${e?.message || e}`);
                }
                break;
            }
            case 'deselectChat': {
                await this.sessionManager.clearActiveSession();
                this.activeSessionId = '';
                this.developerLogService.log('[OrchestratorAgent] Active session cleared (deselectChat).');
                break;
            }
            case 'stop': {
                this.developerLogService.log('[OrchestratorAgent] Received STOP command from UI');
                this.isCancellationRequested = true;
                await this.cancelTask();
                this._onDidPostMessage.fire({ command: 'progressLog', payload: { text: 'Stop requested by user...' } });
                break;
            }
            case 'rollbackTo': {
                try {
                    const { messageId, timestamp } = message.payload;
                    this.developerLogService.log(`[OrchestratorAgent] Received ROLLBACK-TO command. Target ID: ${messageId}, TS: ${timestamp}`);
                    this.isCancellationRequested = true;

                    // 1. Find message index in history
                    const history = this.chatHistory;
                    let targetIndex = -1;
                    
                    if (messageId) {
                        targetIndex = history.findIndex(m => m.messageId === messageId);
                    } else if (timestamp) {
                        targetIndex = history.findIndex(m => m.timestamp === timestamp);
                    }

                    if (targetIndex !== -1) {
                         // 2. Truncate History
                         const keptHistory = history.slice(0, targetIndex + 1);
                         const targetMessage = history[targetIndex];
                         this.chatHistory = keptHistory;
                         
                         // 3. Truncate LLM Conversation History
                         if (targetMessage.author === 'user') {
                             const userText = targetMessage.content[0].text;
                             const llmIndex = this.llmConversationHistory.findIndex(m => m.role === 'user' && m.content === userText); 
                             if (llmIndex !== -1) {
                                  this.llmConversationHistory = this.llmConversationHistory.slice(0, llmIndex + 1);
                             }
                         }

                         // 4. Reset Plan State
                         this.currentPlan = []; 
                         this.currentStepIndex = -1;
                         this.currentExecutionId = '';
                         this.pendingPlan = null;
                         this.isAwaitingPlanConfirmation = false;
                         
                         // 5. Update State Persistence
                         if (this.activeSessionId) {
                             await this.sessionManager.overwriteMessages(this.activeSessionId, keptHistory);
                             // Force sync LLM History (hack: sessionManager reads state directly for safety, we update the object)
                             const state = this.sessionManager.getState();
                             if (state) {
                                state.llmHistory = this.llmConversationHistory;
                                state.tasks = [];
                             }
                             // Note: overwriteMessages triggers saveCurrentState, so LLM history will be saved if attached to state object
                         }
                         
                         // 6. Notify UI
                         this._onDidPostMessage.fire({ 
                            command: 'historyList', 
                            payload: { sessions: this.sessionManager.getSessions(), activeId: this.sessionManager.getActiveSessionId() } 
                         });
                         
                        await this.handleSessionChangeProxy(); 
                         
                         this._onDidPostMessage.fire({ command: 'progressLog', payload: { text: `⏪ Time Travel successful. Context reset to selected message.` } });

                    } else {
                        this._onDidPostMessage.fire({ command: 'progressLog', payload: { text: '⚠️ Could not find target message for rollback.' } });
                    }
                } catch (e: any) {
                     this.developerLogService.log(`Rollback failed: ${e?.message}`);
                }
                break;
            }
            case 'setAutonomousMode':
                if (typeof message.enabled === 'boolean') {
                    this.autonomousMode = !!message.enabled;
                }
                break;
            case 'acceptUroborosMode': {
                this.autonomousMode = true;
                this.sessionSuppressComplexityPrompt = false;
                const userText = message.payload?.userText || this.lastUserQuery;
                if (userText) {
                    await this.transitionToUroborosMode(userText);
                }
                break;
            }
            case 'enableUroborosMode': {
                const userText = message.payload?.userText || this.lastUserQuery;
                if (userText) {
                    await this.transitionToUroborosMode(userText);
                }
                break;
            }
            case 'declineUroborosMode': {
                // 사용자가 Uroboros Mode 제안을 거부
                const suppressForSession = message.payload?.suppressForSession === true;
                if (suppressForSession) {
                    this.sessionSuppressComplexityPrompt = true;
                }
                const userText = message.payload?.userText || this.lastUserQuery;
                if (userText) {
                    // SDK Standard: 해당 요청에 대해서는 더 이상 Uroboros Mode를 제안하지 않음
                    this.declinedUroborosQueries.add(userText.trim().toLowerCase());
                    this.developerLogService.log(`User declined Uroboros Mode for query: "${userText}". Will not propose again for this query.`);

                    // 즉시 실행
                    const alreadyAdded = this.chatHistory.some(m => m.author === 'user' && m.content?.[0]?.text === userText);
                    if (!alreadyAdded) {
                        const userMessage: ChatMessage = { author: 'user', content: [{ type: 'text', text: userText }], senderName: 'User', timestamp: new Date().toISOString() };
                        await this.addMessageToHistory(userMessage);
                    }
                    this.llmConversationHistory.push({ role: 'user', content: userText });
                    // SDK Standard: Plan이 없는 경우에도 correlation 설정
                    if (!this.planId) { this.planId = uuidv4(); }
                    if (!this.currentExecutionId) { this.currentExecutionId = uuidv4(); }
                    // Unified Execution Flow
                    const ctx: any = { 
                        userMessage: userText, 
                        request: { 
                            message: { 
                                senderName: 'User', 
                                parts: [{ kind: 'text', text: userText }] 
                            } 
                        } 
                    };
                    await this.execute(ctx, { publish: (m: any) => this.dispatch(m), subscribe: () => {} } as any);
                }
                break;
            }
            				case 'updatePlanFromUI':
					try {
						const steps: string[] = Array.isArray(message?.payload?.steps) ? message.payload.steps : [];
						if (steps.length > 0 && this.autonomousMode) {
							// Rebuild plan from user-edited steps (Uroboros mode)
							this.planId = uuidv4();
							this.planKind = 'main';
							this.hasExecutedCoreFollowups = false;
							this.currentPlan = steps.map((desc: string, i: number) => ({ id: `${this.planId}:${i + 1}`, description: desc, status: 'pending' }));
                        this.currentStepIndex = -1;
                        this.currentExecutionId = '';
                        try { this.handledExecutions.clear(); } catch {}
                        // Keep awaiting user approval
                        this.pendingPlan = this.currentPlan.map(step => ({ ...step }));
                        this.isAwaitingPlanConfirmation = true;
                        // Re-display edited plan
                        this._onDidPostMessage.fire({ command: 'displayPlan', payload: { plan: this.currentPlan } });
                        await this.saveCurrentChatHistory();
                        await this.saveCurrentLlmHistory();
                    }
                } catch (e) {
                    console.warn('[OrchestratorAgent] Failed to apply updatePlanFromUI:', e);
                }
                break;

            case 'viewReady':
                this._onDidPostMessage.fire({ command: 'slashCommandsResponse', payload: SLASH_COMMANDS });
                if (this.chatHistory.length === 0) {
                    const welcomeText = 'Hello! I\'m Vibroboros, your AI coding partner. Feel free to ask me questions, request code, or type `/help` to see available commands.';
                    const welcomeMessage: ChatMessage = { author: 'agent', content: [{ type: 'text', text: welcomeText }], senderName: 'Vibroboros', timestamp: new Date().toISOString() };
                    await this.addMessageToHistory(welcomeMessage);
                    this._onDidPostMessage.fire({ command: 'loadHistory', payload: this.chatHistory });
                }
                break;
            case 'acceptChangeApplied':
                if (message.filePath) {
                    try {
                        this.lastAppliedFilePath = message.filePath;
                        // Hide diff bubble
                        this._onDidPostMessage.fire({ command: 'hideDiff', payload: { filepath: message.filePath } });
                        try { this.recordArtifact(message.filePath, 'updated'); } catch {}

                        // If this file was just applied via 'acceptChange', skip duplicate confirmation/advancement
                        const ts = this.recentlyAppliedFiles.get(message.filePath);
                        const isDuplicateApply = typeof ts === 'number' && (Date.now() - ts) < 10000;
                        if (isDuplicateApply) {
                            // Clear marker to avoid long-lived suppression
                            this.recentlyAppliedFiles.delete(message.filePath);
                            break;
                        }

                        const okText = `File '${path.basename(message.filePath)}' has been created/updated successfully.`;
                        this.developerLogService.log(`[OrchestratorAgent] ${okText}`);
                        this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: okText } });
                        this._onDidPostMessage.fire({ command: 'progressLog', payload: { text: okText } });
                        // Save progress log to history
                        const progressMsg: ChatMessage = { author: 'agent', content: [{ type: 'text', text: okText }], senderName: 'System', timestamp: new Date().toISOString(), kind: 'progress' };
                        await this.addMessageToHistory(progressMsg);
                        try { await this.runLintForFile(message.filePath); } catch {}

                        // Mark current in-progress step as completed
                        const currentStepIndex = this.currentPlan.findIndex(step => step.status === 'in-progress');
                        if (currentStepIndex !== -1) {
                            this.currentPlan[currentStepIndex].status = 'completed';
                            this._onDidPostMessage.fire({ command: 'updatePlanStep', payload: { index: currentStepIndex, status: 'completed' } });
                            const stepText = `Step ${currentStepIndex + 1} completed.`;
                            this._onDidPostMessage.fire({ command: 'progressLog', payload: { text: stepText } });

                            // Update TASK.md via TaskDecompositionAgent
                            await this.updateTaskMd(currentStepIndex, this.currentPlan[currentStepIndex].description);
                            const stepMsg: ChatMessage = { author: 'agent', content: [{ type: 'text', text: stepText }], senderName: 'System', timestamp: new Date().toISOString(), kind: 'progress' };
                            await this.addMessageToHistory(stepMsg);
                        }

                        // Advance plan or finish
                        const nextStepIndex = this.currentPlan.findIndex(step => step.status === 'pending');
                        if (this.currentPlan.length > 0 && nextStepIndex !== -1) {
                            await this.executePlan();
                        } else if (this.currentPlan.length > 0 && nextStepIndex === -1) {
                            this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: 'Plan finished.' } });
                            await this.sendPlanCompletionSummary(false);
                            await this.updateSessionTitleSummary?.();
                            this.currentPlan = [];
                            const postSteps = this.buildDynamicPostActionsFromArtifacts();
                            // Preserve pending follow-ups for confirmation; the actual ask is handled in sendPlanCompletionSummary
                            if (postSteps.length > 0) {
                                this.pendingPostActions = postSteps;
                                this.isAwaitingPostActionsConfirmation = true;
                            }
                            this.producedArtifacts.clear();
                        }
                    } catch (e) {
                        this.handleError(e as any);
                    }
                }
                break;
            case 'acceptChange':
                if (message.filePath && typeof message.modifiedCode === 'string') {
                    try {
                        // Fork logic based on suggestion type
                        const suggestionType = message.suggestionType || 'create-file';
                        if (suggestionType === 'command-execution') {
                            const tool = new ExecuteCommandTool();
                            const result = await tool.execute({ command: message.modifiedCode });
                            
                            if (!result.success) {
                                this.handleError(new Error(`Command execution failed: ${result.stderr}`));
                                return;
                            }
                            const output = result.stdout || result.stderr;
                            const text = `Command executed successfully. Output:\n\`\`\`\n${output}\n\`\`\``;
                            const confirmationMessage: ChatMessage = { author: 'agent', content: [{ type: 'text', text }], senderName: OrchestratorAgent.AGENT_ID, timestamp: new Date().toISOString() };
                            await this.addMessageToHistory(confirmationMessage);
                            this._onDidPostMessage.fire({ command: 'response', payload: { text } });
                        } else {
                            // Default to file writing via MCP
                            const mcpClient = getMcpClient();
                            // Ensure directory exists (local) then delegate write to MCP tool
                            const dir = path.dirname(message.filePath);
                            try { await fs.mkdir(dir, { recursive: true }); } catch {}
                            await mcpClient.callTool({ name: 'FileWriteTool', arguments: { filePath: message.filePath, content: message.modifiedCode } } as any);
                            // console.log(`[OrchestratorAgent] Wrote file (MCP): ${message.filePath}`);
                            // Hide diff bubble for this file
                            this._onDidPostMessage.fire({ command: 'hideDiff', payload: { filepath: message.filePath } });
                            try { this.recordArtifact(message.filePath, suggestionType === 'create-file' ? 'created' : 'updated'); } catch {}

                            // Mark as recently applied to avoid double advancement when 'acceptChangeApplied' also fires
                            this.recentlyAppliedFiles.set(message.filePath, Date.now());

                            // Confirm to chat (Localized)
                            const okText = `File '${path.basename(message.filePath)}' has been created/updated successfully.`;
                            this.developerLogService.log(`[OrchestratorAgent] ${okText}`);
                            this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: okText } });
                            this._onDidPostMessage.fire({ command: 'progressLog', payload: { text: okText } });
                            // Save progress log to history
                            const progressMsg: ChatMessage = { author: 'agent', content: [{ type: 'text', text: okText }], senderName: 'System', timestamp: new Date().toISOString(), kind: 'progress' };
                            await this.addMessageToHistory(progressMsg);
                            try { await this.runLintForFile(message.filePath); } catch {}

                            // Mark current in-progress step as completed
                            const currentStepIndex = this.currentPlan.findIndex(step => step.status === 'in-progress');
                            if (currentStepIndex !== -1) {
                                this.currentPlan[currentStepIndex].status = 'completed';
                                this._onDidPostMessage.fire({ command: 'updatePlanStep', payload: { index: currentStepIndex, status: 'completed' } });

                                // Update TASK.md via TaskDecompositionAgent
                                await this.updateTaskMd(currentStepIndex, this.currentPlan[currentStepIndex].description);
                            }

                            // Advance plan or finish
                            const nextStepIndex = this.currentPlan.findIndex(step => step.status === 'pending');
                            if (this.currentPlan.length > 0 && nextStepIndex !== -1) {
                                await this.executePlan();
                            } else if (this.currentPlan.length > 0 && nextStepIndex === -1) {
                                this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: 'Plan finished.' } });
                                await this.sendPlanCompletionSummary(false);
                                await this.updateSessionTitleSummary?.();
                                this.currentPlan = [];
                                const postSteps = this.buildDynamicPostActionsFromArtifacts();
                                // Preserve pending follow-ups for confirmation; the actual ask is handled in sendPlanCompletionSummary
                                if (postSteps.length > 0) {
                                    this.pendingPostActions = postSteps;
                                    this.isAwaitingPostActionsConfirmation = true;
                                }
                                this.producedArtifacts.clear();
                            }
                        }
                    } catch (error: any) {
                        this.handleError(error);
                    }
                }
                break;
            case 'declineChange':
                if (message.filePath) {
                    try {
                        // If the user declines a file creation/modification, we should revert/delete it.
                        // For now, we simply delete the file if it exists (assuming it was a new file or user wants it gone).
                        // In a more advanced version, we might want to revert to original content if it was an update.
                        // But user specifically asked: "When I reject a created file, it should be deleted."
                        
                        // Check if file exists
                        const exists = await fs.stat(message.filePath).then(() => true).catch(() => false);
                        if (exists) {
                            await fs.unlink(message.filePath);
                            this.developerLogService.log(`[OrchestratorAgent] Deleted rejected file: ${message.filePath}`);
                            
                            const text = `File '${path.basename(message.filePath)}' has been deleted.`;
                            this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text } });
                            this._onDidPostMessage.fire({ command: 'progressLog', payload: { text } });
                            
                            // Save to history
                            const progressMsg: ChatMessage = { author: 'agent', content: [{ type: 'text', text }], senderName: 'System', timestamp: new Date().toISOString(), kind: 'progress' };
                            await this.addMessageToHistory(progressMsg);
                        }

                        // Hide diff bubble
                        this._onDidPostMessage.fire({ command: 'hideDiff', payload: { filepath: message.filePath } });
                        
                    } catch (error: any) {
                        this.handleError(error);
                    }
                }
                break;
            case 'alwaysAcceptChange':
                if (message.filePath && message.originalCode && message.modifiedCode && message.suggestionType) {
                    try {
                        const currentContent = await fs.readFile(message.filePath, 'utf-8');
                        if (currentContent === message.originalCode) {
                            const mcpClient = getMcpClient();
                            await mcpClient.callTool({ name: 'FileWriteTool', arguments: { filePath: message.filePath, content: message.modifiedCode } } as any);
                            const confirmationMessage: ChatMessage = { author: 'agent', content: [{ type: 'text', text: `Changes applied to ${path.basename(message.filePath)}` }], senderName: OrchestratorAgent.AGENT_ID, timestamp: new Date().toISOString() };
                            await this.addMessageToHistory(confirmationMessage);
                            this._onDidPostMessage.fire({ command: 'response', payload: { text: `Changes applied to ${path.basename(message.filePath)}` } });
                            try { this.recordArtifact(message.filePath, message.suggestionType === 'create-file' ? 'created' : 'updated'); } catch {}
                            // Log preference
                            this.alwaysAcceptSuggestions.add(message.suggestionType);
                        } else {
                            this.handleError(new Error('The file has been modified since the change was proposed.'));
                        }
                    } catch (error: any) {
                        this.handleError(error);
                    }
                }
                break;
            case 'userQuery':
                this.developerLogService.log(`[OrchestratorAgent] Entering 'userQuery' case. pendingPlan = ${!!this.pendingPlan}`);
                const queryRaw = (message.query ?? '').toString();
                const query = queryRaw.trim();
                // Mark last user input time for duplicate-dispatch suppression
                this.lastUserInputAt = Date.now();
                // Sticky routing: if an agent (e.g., BrainstormAgent) is awaiting user input, route directly
                try {
                    const now = Date.now();
                    if (this.stickyAgentName === 'BrainstormAgent' && this.stickyExpiresAt > now) {
                        // Sticky path: MUST add to history manually because we do NOT call handleChat
                        const userMessage: ChatMessage = { author: 'user', content: [{ type: 'text', text: message.query }], senderName: 'User', timestamp: new Date().toISOString(), messageId: message.messageId };
                        // Dedup check for sticky path (manual bc no centralized handler)
                        const stickyAlreadyAdded = this.chatHistory.some(m => (message.messageId && m.messageId === message.messageId));
                        if (!stickyAlreadyAdded) {
                            await this.addMessageToHistory(userMessage);
                        }
                        this.llmConversationHistory.push({ role: 'user', content: message.query });
                        // Store for SDK standard message
                        this.lastUserQuery = query;
                        // Correlation payload (reuse current plan step if any) and sticky session routing
                        const stepId = (this.currentStepIndex >= 0 && this.currentStepIndex < this.currentPlan.length) ? this.currentPlan[this.currentStepIndex].id : '';
                        const correlation = { planId: this.planId, workflowId: this.planId, stepId, executionId: this.currentExecutionId, runId: this.currentExecutionId, sessionId: this.activeSessionId } as any;
                        if (!this.brainstormContextId) { this.brainstormContextId = uuidv4(); }

                        // SDK Standard: Send user query as task
                        await this.dispatch({
                            messageId: uuidv4(),
                            sender: AgentNames.ORCHESTRATOR,
                            recipient: AgentNames.BRAINSTORM,
                            timestamp: new Date().toISOString(),
                            contextId: this.brainstormContextId,
                            parts: [
                                { kind: 'text', text: query },  // SDK Standard: parts[0].text = task
                                { kind: 'data', mimeType: 'application/vnd.a2a+json', data: {
                                    task: query,           // SDK Standard: user query is the task
                                    query: query,          // Duplicate for reference
                                    correlation
                                }}
                            ]
                        } as any);
                        return;
                    }
                } catch (e: any) { this.developerLogService.log(`Sticky routing error: ${e.message}`); }

                // Attachments handling
                const attachments = Array.isArray(message.attachments) ? message.attachments : [];
                this.lastImageAttachments = [];
                if (attachments.length > 0) {
                    try {
                        const parts: string[] = [];
                        const collectedPaths: string[] = [];
                        for (const a of attachments) {
                            if (!a) { continue; }
                            // Check for base64 image data
                            if (a.type === 'file' && typeof a.content === 'string' && a.content.startsWith('data:image/')) {
                                this.lastImageAttachments.push({ url: a.content, label: a.label });
                                parts.push(`- [image] ${a.label}`);
                                continue;
                            }
                            if (a.type === 'code' && typeof a.content === 'string') {
                                parts.push(`- [code] ${a.label}\n${(a.content || '').slice(0, 4000)}`);
                            } else if ((a.type === 'file' || a.type === 'folder') && a.uri) {
                                try {
                                    const u = vscode.Uri.parse(a.uri);
                                    const filePath = u.fsPath;
                                    const stat = await fs.stat(filePath).catch(() => null);
                                    if (stat && stat.isFile()) {
                                        const content = await fs.readFile(filePath, 'utf-8');
                                        parts.push(`- [file] ${a.label}\n${content.slice(0, 4000)}`);
                                        collectedPaths.push(filePath);
                                    } else if (stat && stat.isDirectory()) {
                                        try {
                                            const mcpClient = getMcpClient();
                                            const ws = vscode.workspace.workspaceFolders;
                                            const root = ws?.[0]?.uri?.fsPath || '';
                                            const rel = root ? path.relative(root, filePath) : filePath;
                                            const list = await mcpClient.callTool({ name: 'ListDirTool', arguments: { dirPath: rel || '.' } } as any);
                                            const entries: any[] = (list as any)?.structuredContent?.entries || [];
                                            const top = entries.slice(0, 50).map(e => `${e.type === 'dir' ? '[D]' : '[F]'} ${e.path}`).join('\n');
                                            parts.push(`- [folder] ${a.label}\n${top}`);
                                        } catch {
                                            parts.push(`- [folder] ${a.label}`);
                                        }
                                    } else {
                                        parts.push(`- [${a.type}] ${a.label}`);
                                    }
                                } catch {
                                    parts.push(`- [${a.type}] ${a.label}`);
                                }
                            } else {
                                parts.push(`- [${a.type}] ${a.label}`);
                            }
                        }
                        if (parts.length > 0) {
                            const ctx = `ATTACHMENTS CONTEXT\n${parts.join('\n')}`;
                            this.llmConversationHistory.push({ role: 'system', content: ctx });
                        }
                        if (collectedPaths.length > 0) {
                            this.lastAttachmentFilePaths = collectedPaths;
                        }
                    } catch {}
                }

                // 1) If we are waiting for follow-up post-actions confirmation, handle that first.
                if (this.isAwaitingPostActionsConfirmation && this.pendingPostActions && this.pendingPostActions.length > 0) {
                    const handled = await this.handlePostActionsConfirmation(query);
                    if (handled) {
                        break;
                    }
                }
                // 2) If we are waiting for main plan confirmation, interpret this as confirmation input.
                if (this.isAwaitingPlanConfirmation && this.pendingPlan && this.pendingPlan.length > 0) {
                    const planHandled = await this.handlePlanConfirmation(query);
                    if (planHandled) {
                        break;
                    }
                }
                
                // 3) If we are waiting for Uroboros Mode confirmation
                if (this.pendingUroborosProposal) {
                     // SDK Standard: Use LLM-based intent classification
                     const intent = await this.checkConfirmationIntent(query);
                     
                     if (intent === 'confirm') {
                         this.developerLogService.log(`User accepted Uroboros proposal: "${query}"`);
                         const proposal = this.pendingUroborosProposal;
                         this.pendingUroborosProposal = null; // Clear state
                         
                         // Add user affirmation to history
                         const userMessage: ChatMessage = { author: 'user', content: [{ type: 'text', text: query }], senderName: 'User', timestamp: new Date().toISOString() };
                         await this.addMessageToHistory(userMessage);
                         
                         // Transition to Uroboros Mode with the original complex task text
                         await this.transitionToUroborosMode(proposal.userText);
                         break;
                     } else if (intent === 'deny') {
                         this.developerLogService.log(`User declined Uroboros proposal: "${query}"`);
                         this.pendingUroborosProposal = null; // Clear state
                         this.declinedUroborosQueries.add((this.pendingUroborosProposal as any)?.userText?.trim()?.toLowerCase() || '');
                         // Fall through to normal processing
                     }
                     // If uncertain, fall through to normal processing (or could ask for clarification)
                }

                // 4) Otherwise, treat the query as a normal chat/specialist request.
                // Call handler with messageId for strict deduplication & persistence
                await this.handleChatAndSpecialistCommands(query, message.messageId);
                break;
            default:
                this.developerLogService.log(`[OrchestratorAgent] Unhandled UI message type: ${message.command}`);
                break;
        }
    } catch (error: any) {
        this.developerLogService.log(`[OrchestratorAgent] Error handling UI message: ${error?.message || error}`);
        console.error('[OrchestratorAgent] Error handling UI message:', error);
        this._onDidPostMessage.fire({ 
            command: 'error', 
            payload: { message: `Internal error: ${error?.message || 'Unknown error'}` } 
        });
        this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: 'Error', final: true } });
    }

        // After handling the UI message, if a plan has just completed successfully, delegate to the unified
        // summary routine so TASK-style summary and follow-up suggestions are produced.
        const completedCount = this.currentPlan.filter(step => step.status === 'completed').length;
        const errorCount = this.currentPlan.filter(step => step.status === 'error').length;
        const total = this.currentPlan.length;
        if (total > 0 && errorCount === 0 && completedCount === total) {
            const statusText = 'Plan finished.';
            this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: statusText } });
            await this.sendPlanCompletionSummary(false);
            this.currentPlan = [];
            this.producedArtifacts.clear();
            this.isAwaitingPlanConfirmation = false;
            this.pendingPlan = null;
        }
    }

    private async transitionToUroborosMode(userText: string): Promise<void> {
        this.developerLogService.log(`Transitioning to Uroboros Mode. Routing to BrainstormAgent.`);
        const alreadyAdded = this.chatHistory.some(m => m.author === 'user' && m.content?.[0]?.text === userText);
        if (!alreadyAdded) {
            const userMessage: ChatMessage = { author: 'user', content: [{ type: 'text', text: userText }], senderName: 'User', timestamp: new Date().toISOString() };
            await this.addMessageToHistory(userMessage);
        }
        this.llmConversationHistory.push({ role: 'user', content: userText });
        this.lastUserQuery = userText;

        const stepId = (this.currentStepIndex >= 0 && this.currentStepIndex < this.currentPlan.length) ? this.currentPlan[this.currentStepIndex].id : '';
        const correlation = { planId: this.planId, workflowId: this.planId, stepId, executionId: this.currentExecutionId, runId: this.currentExecutionId, sessionId: this.activeSessionId } as any;
        if (!this.brainstormContextId) { this.brainstormContextId = uuidv4(); }

        // Guided Routing: Delegate to Agentic Router for Uroboros Mode
        this.developerLogService.log(`Transitioning to Uroboros Mode. Delegating to Agentic Router for smart dispatch.`);

        // Construct RequestContext
        const contextId = this.brainstormContextId || uuidv4();
        const requestContext: RequestContext = {
            contextId,
            sender: 'User',
            originator: 'User',
            metadata: { sessionId: this.activeSessionId },
            message: {
                messageId: uuidv4(),
                sender: 'User',
                recipient: OrchestratorAgent.AGENT_ID, // Processed by Orchestrator's standard loop
                timestamp: new Date().toISOString(),
                kind: 'message',
                role: 'user',
                contextId,
                parts: [{ kind: 'text', text: userText }]
            } as any
        } as any;

        // Construct EventBus (Minimal)
        const eventBus: ExecutionEventBus = {
             publish: async (event: any) => {
                 if (event?.type === 'progress' && event?.data) {
                     this.processProgressLog(event.data, 'OrchestratorAgent');
                 }
             }
        } as any;

        try {
            await this.execute(requestContext, eventBus);
        } catch (e: any) {
            this.developerLogService.log(`[OrchestratorAgent] Uroboros Routing/Execute failed: ${e?.message || e}`);
             // Safe Fallback
             await this.dispatch({
                messageId: uuidv4(),
                sender: AgentNames.ORCHESTRATOR,
                recipient: AgentNames.BRAINSTORM,
                timestamp: new Date().toISOString(),
                contextId: this.brainstormContextId,
                parts: [
                    { kind: 'text', text: userText },
                    { kind: 'data', mimeType: 'application/vnd.a2a+json', data: {
                        task: userText,
                        query: userText,
                        correlation
                    }}
                ]
            } as any);
        }
    }

    private processedMessageIds: Set<string> = new Set();


    private async checkConfirmationIntent(userText: string): Promise<'confirm' | 'deny' | 'uncertain'> {
        if (!userText || userText.trim().length === 0) return 'uncertain';

        const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
        const apiKeys = await this.configService.getApiKeys();
        const endpoint = this.configService.getEndpoint();
        const provider = this.configService.getLlmProvider();
        
        const prompt = `System: You are an intent classifier. The user was asked a Yes/No question (e.g. "Do you want to proceed with the advanced mode?").
User Input: "${userText}"
Classify the intent as:
- "confirm" (Yes, Go ahead, OK, Proceed, Agree, Accept, Start, 네, 그래, 진행, 좋아, 응, ㅇㅇ, etc.)
- "deny" (No, Stop, Cancel, Reject, Wait, Skip, 아니, 싫어, 취소, 이전, 멈춰, ㄴㄴ, etc.)
- "uncertain" (Anything else, Ambiguous, Questioning, Unrelated)

Output ONLY the raw JSON object: {"intent": "confirm"|"deny"|"uncertain"}`;

        try {
            const response = await this.llmService.requestLLMCompletion(
                provider,
                [{ role: 'user', content: prompt }],
                apiKeys[0] || '',
                endpoint,
                [],
                model,
                undefined,
                10000 // Short timeout for UI responsiveness
            );
            const content = (response.choices?.[0]?.message?.content ?? (response as any).choices?.[0]?.text ?? '').toString().trim();
            
            // Allow loose JSON parsing
            const match = content.match(/\{[\s\S]*\}/);
            const jsonStr = match ? match[0] : content;
            const parsed = JSON.parse(jsonStr);
            
            if (parsed.intent === 'confirm' || parsed.intent === 'deny' || parsed.intent === 'uncertain') {
                return parsed.intent;
            }
            return 'uncertain';
        } catch (error) {
            this.developerLogService.log(`[OrchestratorAgent] checkConfirmationIntent failed: ${error}`);
            // Fallback to strict regex for safety if LLM fails
            if (/^(y|yes|ok|sure|agree|accept|please|go|do|start|confirm|네|그래|좋아|응|확인|진행|ㅇㅇ)/i.test(userText)) return 'confirm';
            if (/^(n|no|stop|wait|deny|reject|아니|싫어|취소|이전|멈춰|ㄴㄴ)/i.test(userText)) return 'deny';
            return 'uncertain';
        }
    }


    private async handleChatAndSpecialistCommands(userText: string, messageId?: string): Promise<void> { // Make it async
        console.log(`[OrchestratorAgent] handleChatAndSpecialistCommands called with text: "${userText.slice(0, 50)}..."`);
        this.developerLogService.log(`[OrchestratorAgent] handleChatAndSpecialistCommands called with text: "${userText.slice(0, 50)}..."`);
        if (messageId && this.processedMessageIds.has(messageId)) {
            console.log(`[OrchestratorAgent] Skipping already processed message ID: ${messageId}`);
            return;
        }
        if (messageId) {
            this.processedMessageIds.add(messageId);
        }

        const sessionId = this.activeSessionId; // Capture session ID at start
        if (!userText) { return; }

    // Handle slash commands
    if (userText.startsWith('/')) {
        const cmd = userText.trim();
        if (cmd === '/clear') {
             this.llmConversationHistory = [];
             // Clear session messages via sessionManager effectively?
             // Since sessionManager.clear() might be needed.
             // For now just clear LLM history and notify.
             await this.addMessageToHistory({
                author: 'agent',
                content: [{type: 'text', text: 'Chat history cleared (LLM Context).'}], 
                senderName: 'Orchestrator'
             });
             this._onDidPostMessage.fire({ command: 'clearHistory' });
             return;
        }
        if (cmd === '/help') {
             const helpText = SLASH_COMMANDS.map(c => `**${c.command}** - ${c.description}`).join('\n');
             await this.addMessageToHistory({
                 author: 'agent',
                 content: [{ type: 'text', text: `Here are the available commands:\n\n${helpText}` }],
                 senderName: 'Orchestrator'
             });
             return;
        }
        if (cmd === '/test health' && typeof this.runAgentHealthCheck === 'function') {
             await this.runAgentHealthCheck();
             return;
        }
    }

        // Store original user query for agents that need context (e.g., BrainstormAgent)
        this.lastUserQuery = userText;

        // SDK Standard: Centralized storage
        // Check if already in history (double safety)
        console.log('[OrchestratorAgent] handleChat debug: Step 2 (checking duplication)');
        const isIdDuplicate = messageId && this.chatHistory.some(m => m.messageId === messageId);
        
        // Synchronous Debounce: Check if we are already processing this exact text (race condition fix)
        console.log('[OrchestratorAgent] handleChat debug: Step 3 (checking debounce)');
        // This prevents double-submits where chatHistory hasn't updated yet.
        if (this.recentQueryDebounce.has(userText)) {
             console.log(`[OrchestratorAgent] Skipping debounced content: "${userText.slice(0, 20)}..."`);
             return;
        }
        console.log('[OrchestratorAgent] handleChat debug: Step 4 (debounce passed)');

        if (isIdDuplicate) {
            console.log(`[OrchestratorAgent] Skipping duplicate message ID: ${messageId}`);
            return;
        }
        
        // Lock this content for 2 seconds
        this.recentQueryDebounce.add(userText);
        setTimeout(() => this.recentQueryDebounce.delete(userText), 2000);
        console.log('[OrchestratorAgent] handleChat debug: Step 5 (debounce lock set)');

        const userMessage: ChatMessage = { 
            author: 'user', 
            content: [{ type: 'text', text: userText }], 
            senderName: 'User', 
            timestamp: new Date().toISOString(),
            messageId: messageId
        };
        console.log('[OrchestratorAgent] calling addMessageToHistory...');
        await this.addMessageToHistory(userMessage);
        console.log('[OrchestratorAgent] addMessageToHistory completed.');

        // Add to history for context - support multimodal content if images are attached
        if (this.lastImageAttachments && this.lastImageAttachments.length > 0) {
            const multimodalContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
                { type: 'text', text: userText },
                ...this.lastImageAttachments.map(img => ({ type: 'image_url' as const, image_url: { url: img.url } }))
            ];
            this.llmConversationHistory.push({ role: 'user', content: multimodalContent as any });
            // Clear after use
            this.lastImageAttachments = [];
        } else {
            // Standard push (Root cause of duplication in Complex block is fixed, so this is safe)
            this.llmConversationHistory.push({ role: 'user', content: userText });
        }

        const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
        const apiKeys = await this.configService.getApiKeys();
        const endpoint = this.configService.getEndpoint();
        const provider = this.configService.getLlmProvider();

        // Bug-fix detection removed - LLM will handle intent detection

        // Single-Prompt Architecture: Delegate EVERYTHING to Agentic Router
        // The Router (SystemPromptFactory 'router') will determine intent, complexity, and target agent in ONE step.
        
        this.developerLogService.log(`[OrchestratorAgent] Delegating user query to Agentic Router (Single-Prompt Architecture).`);

        const contextId = this.brainstormContextId || uuidv4();
        const requestContext: RequestContext = {
            contextId,
            sender: 'User',
            originator: 'User',
            metadata: { sessionId: this.activeSessionId },
            message: {
                messageId: messageId || uuidv4(),
                sender: 'User',
                recipient: OrchestratorAgent.AGENT_ID,
                timestamp: new Date().toISOString(),
                kind: 'message',
                role: 'user',
                contextId,
                parts: [{ kind: 'text', text: userText }]
            } as any
        } as any;

        const eventBus: ExecutionEventBus = {
            publish: async (event: any) => {
                const isProgress = event?.type === 'progress' || event?.kind === 'status-update';
                const messageText = event?.data || (event?.status?.message?.parts?.find?.((p: any) => p.kind === 'text')?.text);
                
                if (isProgress && messageText) {
                    this.processProgressLog(messageText, 'OrchestratorAgent');
                } else if (event?.kind === 'status-stream' && event?.content) {
                    // [Fix] Handle streaming chunks for Orchestrator (e.g. Thinking Process)
                    // Directly fire chunk to UI to append to the active log item
                    this._onDidPostMessage.fire({ 
                        command: 'progressLogChunk', 
                        payload: { 
                            text: event.content 
                        } 
                    });
                }
                
                // Handle Resource Action (File Created) -> Generate UI Block & Persist
                if (event?.type === 'resource-action' && event?.data?.uri) {
                     let fileContent = '';
                     try {
                         fileContent = await fs.readFile(event.data.uri, 'utf-8');
                     } catch {}

                     const isUpdate = event.data.action === 'update';
                     const msgPayload = UIMessageFactory.createFileCard(
                         OrchestratorAgent.AGENT_ID,
                         event.data.uri,
                         isUpdate,
                         undefined,
                         '', // originalCode (unavailable, treated as all new/current)
                         fileContent // modifiedCode
                     );

                     const historyMsg: ChatMessage = {
                         author: 'agent',
                         kind: 'codeEditFile',
                         senderName: msgPayload.payload.senderName,
                         timestamp: msgPayload.payload.timestamp,
                         filePath: msgPayload.payload.filePath,
                         title: msgPayload.payload.title,
                         suggestionType: msgPayload.payload.suggestionType,
                         content: [{ type: 'text', text: `${isUpdate ? 'Updated' : 'Created'} file: ${path.basename(event.data.uri)}` }],
                         ...msgPayload.payload // Include raw payload for diff properties
                     } as any;
                     
                     // Persist to Memento
                     await this.addMessageToHistory(historyMsg);
                     
                     // Notify UI to render immediately
                     this._onDidPostMessage.fire(msgPayload);
                     // Force sync history update just in case
                     this._onDidPostMessage.fire({ command: 'historyUpdate', payload: this.chatHistory });
                }
            }
        } as any;

        try {
            await this.execute(requestContext, eventBus);
        } catch (e: any) {
             this.developerLogService.log(`[OrchestratorAgent] Router Execution failed: ${e?.message || e}`);
             // Fallback: Default to Brainstorm if Router fails catastrophically
             await this.dispatch({
                messageId: uuidv4(),
                sender: AgentNames.ORCHESTRATOR,
                recipient: AgentNames.BRAINSTORM,
                timestamp: new Date().toISOString(),
                contextId: contextId,
                parts: [
                    { kind: 'text', text: userText },
                    { kind: 'data', mimeType: 'application/vnd.a2a+json', data: {
                        task: userText,
                        query: userText
                    }}
                ]
            } as any);
        }
    }



    protected async handleExecutionResult(result: string, requestContext: RequestContext, eventBus: ExecutionEventBus, correlationId?: string): Promise<void> {
        let parsedResult: any;
        try {
            // Locate JSON block if wrapped in markdown
            const jsonMatch = result.match(/```json\n([\s\S]*?)\n```/) || result.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? jsonMatch[0].replace(/```json\n?|```/g, '') : result;
            parsedResult = JSON.parse(jsonString);
        } catch (e) {
            // New Prompt Rule: Self-Execution = Plain Text.
            // If JSON parse fails, we treat it as a Direct Answer/Conversation.
            await this.handleConversationalResponse(result);
            return;
        }

        // --- Schema Adaptation ---
        // New: { targetAgent, thought, payload: { task, complexity, target_file, related_files } }
        // Old: { chosen_agent, reason, target_file, related_files, complexity_score, intent_type }
        
        const payload = parsedResult.payload || {};
        
        const chosen_agent = parsedResult.targetAgent || parsedResult.chosen_agent; 

        // [Standardization] Always prefer payload.message for user-facing text
        const extractedMessage = payload.message || payload.question || payload.result || parsedResult.message || "";
        const extractedThought = parsedResult.thought || parsedResult.reason || "";

        // For delegation context, prefer thought, fallback to message
        const contextForDelegation = extractedThought || extractedMessage;

        const target_file = payload.target_file || parsedResult.target_file;
        const related_files = payload.related_files || parsedResult.related_files;
        let complexity_score = payload.complexity !== undefined ? payload.complexity : parsedResult.complexity_score;
        let intent_type = parsedResult.intent_type; // Maintain legacy read if present

        // Task Description: Use refined logic from payload, fallback to raw input
        const taskDescription = payload.task || (requestContext as any).userInput || (requestContext as any).user_input || '';

        // Normalize complexity (Ensure 0-100)
        let normalizedScore = typeof complexity_score === 'number' ? complexity_score : 0;
        // Legacy Safety: If score is 0-10, scale to 0-100 (unless it's explicitly low complexity)
        if (normalizedScore <= 10 && normalizedScore > 0) normalizedScore = normalizedScore * 10;
        
        this.developerLogService.log(`[Orchestrator] Routing decision: Agent=${chosen_agent}, Score=${normalizedScore}, Intent=${intent_type || 'N/A'}`);

        // --- Strict Filtering & Validation ---
        // 1. If Direct Answer (None) but empty message -> Error/Cancel
        if (chosen_agent === 'None') {
            if (!extractedMessage.trim()) {
                this.developerLogService.log(`[Orchestrator] Empty message received for targetAgent=None. Cancelling and reporting failure.`);
                await this.postMessageToSession(this.activeSessionId, 'progressLog', { text: "Empty response generated. Please try again or rephrase." });
                return;
            }
        }

        // 2. If Delegation but contains redundant user messaging -> Filter Out
        // When delegating, any 'message' for the user is often hallucinated or redundant.
        // We only send messages to UI if targetAgent is "None".
        // Show messages to user regardless of targetAgent (Reverted 1)
        const shouldShowToUser = !!extractedMessage.trim();

        // 1. Complex Task Handling (Uroboros Proposal)
        // Only propose if NOT already in autonomous mode and NOT previously declined
        const UROBOROS_THRESHOLD = 80;
        
        const isComplex = parsedResult.is_complex_task || normalizedScore >= UROBOROS_THRESHOLD;

        if (isComplex && !this.autonomousMode) {
             const userText = (requestContext as any).userInput || (requestContext as any).user_input || 'Complex Task';
             const userTextLower = userText.trim().toLowerCase();
             
             if (this.declinedUroborosQueries.has(userTextLower)) {
                 this.developerLogService.log(`[Orchestrator] User previously declined Uroboros for this query. Proceeding with standard routing.`);
             } else if ((this.configService as any).getUroborosMode()) {
                 this.developerLogService.log(`[Orchestrator] High complexity detected (${normalizedScore}). Proposing Uroboros Mode.`);
                 
                 const proposalMsg = `This task appears to be a high-complexity project (Consistency Score: ${normalizedScore}). Shall I switch to **Uroboros Mode** (Autonomous Agentic Loop) to handle it efficiently?`;
                 const agentMessage: ChatMessage = {
                     author: 'agent',
                     content: [{ type: 'text', text: proposalMsg }],
                     senderName: OrchestratorAgent.AGENT_ID,
                     timestamp: new Date().toISOString()
                 };
                 await this.addMessageToHistory(agentMessage);
                 this.postMessageToSession(this.activeSessionId, 'chatMessage', agentMessage);
                 
                 this.pendingUroborosProposal = { userText };
                 return; // Stop processing, wait for user confirmation
             } else {
                 this.developerLogService.log(`[Orchestrator] High complexity (${normalizedScore}) but Uroboros disabled. Proceeding with standard routing.`);
             }
        }

        // 2. Routing Decision
        if (chosen_agent && chosen_agent !== 'OrchestratorAgent' && chosen_agent !== 'None') {
             // Dispatch to Specialist Agent
             this.developerLogService.log(`[Orchestrator] Dispatching to ${chosen_agent}`);
             
             this.postMessageToSession(this.activeSessionId, 'progressLog', { text: `Routing to ${chosen_agent}...` });

             const dispatchMsg: any = {
                messageId: uuidv4(),
                sender: OrchestratorAgent.AGENT_ID,
                recipient: chosen_agent,
                timestamp: new Date().toISOString(),
                type: 'task', // Unified task type
                contextId: (requestContext as any).contextId,
                parts: [
                    { kind: 'text', text: taskDescription },
                    { kind: 'data', data: { 
                        ...payload,
                        task: taskDescription, 
                        context: contextForDelegation || 'Task delegated by Orchestrator',
                        targetFile: target_file,
                        relatedFiles: related_files,
                        complexity: normalizedScore
                    }}
                ],
                payload: {
                    ...payload,
                    task: taskDescription, // Maintaining payload for backward compatibility
                    context: contextForDelegation || 'Task delegated by Orchestrator',
                    targetFile: target_file,
                    relatedFiles: related_files,
                    complexity: normalizedScore
                }
             };
             
             // Handle Response from Specialist Agent
             const response = await (this.dispatch as any)(dispatchMsg);
             if (response) {
                let replyText = '';
                // Handle various response formats (String bridge, A2A Message, etc.)
                if (typeof response === 'string') {
                    replyText = response;
                } else if ((response as any).parts) { // Standard A2A Message
                    // Extract text parts
                    const textParts = (response as any).parts.filter((p: any) => p.kind === 'text').map((p: any) => p.text);
                    // Extract data parts (result/message)
                    const dataParts = (response as any).parts
                        .filter((p: any) => p.kind === 'data' && p.data?.payload)
                        .map((p: any) => p.data.payload.result || p.data.payload.message || JSON.stringify(p.data.payload));
                    
                    replyText = [...textParts, ...dataParts].filter(Boolean).join('\n\n');
                } else if ((response as any).content) { // Legacy Message
                    replyText = Array.isArray((response as any).content) ? (response as any).content.map((c: any) => c.text || JSON.stringify(c)).join('') : String((response as any).content);
                } else if ((response as any).payload && (response as any).payload.text) { // Payload wrapper
                    replyText = (response as any).payload.text;
                }

                if (replyText) {
                    await this.handleConversationalResponse(replyText);
                }
             }
             
        } else {
             // Direct Answer / Self-Execution
             if (extractedThought) {
                 // Use processProgressLog for persistence and UI update (memento 관리)
                 this.processProgressLog(extractedThought, OrchestratorAgent.AGENT_ID);
             }
             
             // Chat bubble should only contain the user-facing message
             if (shouldShowToUser) {
                 await this.handleConversationalResponse(extractedMessage);
             } else if (!extractedMessage && !extractedThought) {
                 // Fallback if everything is empty (use raw result to avoid total disappearance)
                 await this.handleConversationalResponse(result);
             }
        }
    }

    /**
     * Topological sort using Kahn's algorithm

     * Ensures steps are executed in dependency order
     */


    /**
     * Handle response when it's not a plan (Q&A, greeting, etc.)
     */
    private async handleConversationalResponse(responseText: string): Promise<void> {
        const { thought, userFacingText } = this.parseThoughtAndUserFacingText(responseText);
        
        if (thought) {
            // Also log to progress log as fallback/universal requirement
            this.processProgressLog(thought, OrchestratorAgent.AGENT_ID);
        }

        const agentMessage: ChatMessage = {
            author: 'agent',
            content: [{ type: 'text', text: userFacingText || responseText }],
            // thought: thought, // Moved to progress log to avoid duplication in bubble
            senderName: OrchestratorAgent.AGENT_ID,
            timestamp: new Date().toISOString()
        };
        
        this.addMessageToHistory(agentMessage);
        
        // [Thinking Persistence] Save RAW response (including <thinking>) to LLM context
        // This ensures the model remembers its reasoning for the immediate next turn (Self-Correction).
        this.llmConversationHistory.push({ role: 'assistant', content: responseText });

        await this.saveCurrentChatHistory();
        await this.saveCurrentLlmHistory();
        
        this._onDidPostMessage.fire({
            command: 'response',
            payload: {
                text: userFacingText || responseText,
                // thought: thought || undefined, // Moved to progress log
                senderName: agentMessage.senderName,
                timestamp: agentMessage.timestamp
            }
        });
    }


    private async runAgentHealthCheck(): Promise<void> {
        this.developerLogService.log('Running agent health check...');
        let healthCheckResults: string[] = [];

        for (const agent of OrchestratorAgent.SPECIALIST_AGENTS) {
            try {
                // Simulate a simple message to each agent
                // In a real scenario, you might have a dedicated health check endpoint or message type
                const testMessageContent = `${agent.name}: Health check message.`;
                await this.dispatch({
                    messageId: uuidv4(),
                    sender: OrchestratorAgent.AGENT_ID,
                    recipient: agent.name,
                    timestamp: new Date().toISOString(),
                    type: 'health-check',
                    payload: { message: testMessageContent }
                });
                healthCheckResults.push(`${agent.name}: Good`);
            } catch (e: any) {
                healthCheckResults.push(`${agent.name}: Error - ${e.message}`);
            }
        }

        const resultText = healthCheckResults.join('\n');
        const agentMessage: ChatMessage = { author: 'agent', content: [{ type: 'text', text: resultText }], senderName: OrchestratorAgent.AGENT_ID, timestamp: new Date().toISOString() };
        this.addMessageToHistory(agentMessage);
        this._onDidPostMessage.fire({ command: 'response', payload: { text: resultText }});
    }





    private async handlePlanConfirmation(userText: string): Promise<boolean> {
        try {
            if (!this.isAwaitingPlanConfirmation || !this.pendingPlan || this.pendingPlan.length === 0) {
                return false;
            }

            const input = (userText || '').trim().toLowerCase();
            if (!input) {
                return false;
            }

            const positivePatterns: string[] = [
                'y', 'yes', 'ok', 'okay', 'sure', 'go ahead', 'please proceed',
                '응', '네', '진행', '계속', '좋아', '그래'
            ];
            const negativePatterns: string[] = [
                'n', 'no', 'stop', 'cancel', "don't", 'dont',
                '그만', '아니', '아니오', '취소'
            ];

            const matchesAny = (patterns: string[]) => patterns.some(p =>
                input === p || input.startsWith(p + ' ') || input.endsWith(' ' + p) || input.includes(` ${p} `)
            );

            if (matchesAny(positivePatterns)) {
                // Adopt the pending plan and start execution
                this.currentPlan = this.pendingPlan.map(step => ({ ...step }));
                this.pendingPlan = null;
                this.isAwaitingPlanConfirmation = false;

                const text = 'Understood. I will proceed with the plan.';
                const msg: ChatMessage = {
                    author: 'agent',
                    content: [{ type: 'text', text }],
                    senderName: OrchestratorAgent.AGENT_ID,
                    timestamp: new Date().toISOString()
                };
                await this.addMessageToHistory(msg);
                this._onDidPostMessage.fire({ command: 'response', payload: { text, senderName: msg.senderName, timestamp: msg.timestamp, keepThinking: true } });

                await this.executePlan();
                return true;
            }

            if (matchesAny(negativePatterns)) {
                // Cancel the plan
                this.currentPlan = [];
                this.pendingPlan = null;
                this.isAwaitingPlanConfirmation = false;
                this.planId = '';
                this.currentStepIndex = -1;
                this.currentExecutionId = '';

                const text = 'Understood. I will cancel this plan.';
                const msg: ChatMessage = {
                    author: 'agent',
                    content: [{ type: 'text', text }],
                    senderName: OrchestratorAgent.AGENT_ID,
                    timestamp: new Date().toISOString()
                };
                await this.addMessageToHistory(msg);
                this._onDidPostMessage.fire({ command: 'response', payload: { text, senderName: msg.senderName, timestamp: msg.timestamp } });

                return true;
            }

            // If the input is ambiguous, ask the user to answer clearly but keep waiting.
            const clarification = 'To decide whether to run the plan, please reply with yes/ok to proceed or no/cancel to stop.';
            const msg: ChatMessage = {
                author: 'agent',
                content: [{ type: 'text', text: clarification }],
                senderName: OrchestratorAgent.AGENT_ID,
                timestamp: new Date().toISOString()
            };
            await this.addMessageToHistory(msg);
            this._onDidPostMessage.fire({ command: 'response', payload: { text: clarification, senderName: msg.senderName, timestamp: msg.timestamp } });

            return true;
        } catch (e) {
            this.handleError(e as any);
            return true;
        }
    }

    private async updateSessionTitleSummary(): Promise<void> {
        try {
            const sessions = this.state.get<any[]>(OrchestratorAgent.SESSIONS_INDEX_KEY, []) || [];
            const activeId = this.state.get<string>(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, this.activeSessionId || '');
            if (!activeId || sessions.length === 0) return;

            const advanced = this.configService.getAdvancedHistorySummaryEnabled();
            this.developerLogService.log(`[OrchestratorAgent] updateSessionTitleSummary: activeId=${activeId}, advanced=${advanced}`);
            let title = '';

            if (advanced) {
                // Build a concise prompt from last 6 messages
                const last = [...this.chatHistory].slice(-6);
                const lines: string[] = [];
                for (const m of last) {
                    try {
                        const who = m.author === 'user' ? 'User' : 'AI';
                        let t = '';
                        if (Array.isArray(m.content)) {
                            t = m.content.map((c: any) => (typeof c === 'string' ? c : (c?.text ?? ''))).filter(Boolean).join(' ');
                        }
                        if (!t && (m as any).text) { t = (m as any).text; }
                        if (t) lines.push(`${who}: ${t}`);
                    } catch {}
                }
                const convo = lines.join('\n').slice(0, 2000);
                const sys = { role: 'system', content: 'Summarize the conversation into a single concise session title (<= 60 chars). Output plain text only without quotes or punctuation at ends. Use the conversation language.' } as LlmMessage;
                const user = { role: 'user', content: `Conversation:\n${convo}\n\nTitle:` } as LlmMessage;
                const provider = this.configService.getLlmProvider();
                const apiKeys = await this.configService.getApiKeys();
                const endpoint = this.configService.getEndpoint();
                const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
                const timeout = Math.min(Math.max(8000, this.configService.getRequestTimeout(OrchestratorAgent.AGENT_ID) || 20000), 20000);
                
                try {
                    const resp = await this.llmService.requestLLMCompletion(provider, [sys, user], apiKeys[0] || '', endpoint, [], model, undefined, timeout);
                    this.developerLogService.log(`[OrchestratorAgent] Summary LLM raw response: ${JSON.stringify(resp)}`);
                    const raw = (resp.choices?.[0]?.message?.content ?? (resp as any)?.choices?.[0]?.text ?? '').toString().trim();
                    this.developerLogService.log(`[OrchestratorAgent] Summary LLM extracted content: "${raw}"`);
                    const firstLine = (raw || '').split(/\r?\n/)[0].trim();
                    title = firstLine;
                    this.developerLogService.log(`[OrchestratorAgent] Generated summary title: "${title}"`);
                } catch (llmError: any) {
                    this.developerLogService.log(`[OrchestratorAgent] Summary LLM error: ${llmError?.message || llmError}`);
                }
            }

            if (!title) {
                // Basic fallback: use last agent or user first line
                const pick = [...this.chatHistory].reverse().find(m => (m as any).author === 'agent') || [...this.chatHistory].reverse().find(m => (m as any).author === 'user');
                let text = '';
                if (pick) {
                    if (Array.isArray(pick.content)) {
                        text = pick.content.map((c: any) => (typeof c === 'string' ? c : (c?.text ?? ''))).filter(Boolean).join(' ');
                    } else if (typeof (pick as any).text === 'string') {
                        text = (pick as any).text;
                    }
                }
                const firstLine = (text || '').split(/\r?\n/)[0].trim();
                title = firstLine;
                this.developerLogService.log(`[OrchestratorAgent] Fallback summary title: "${title}"`);
            }

            if (title) {
                const maxLen = 60;
                const summary = title.length > maxLen ? title.slice(0, maxLen - 1) + '…' : title;
                const idx = sessions.findIndex(s => s.id === activeId);
                if (idx >= 0) {
                    sessions[idx] = { ...sessions[idx], title: summary };
                    await this.state.update(OrchestratorAgent.SESSIONS_INDEX_KEY, sessions);
                    this._onDidPostMessage.fire({ command: 'historyList', payload: { sessions, activeId } });
                }
            }
        } catch (e: any) {
            this.developerLogService.log(`[OrchestratorAgent] updateSessionTitleSummary failed: ${e?.message || e}`);
        }
    }





    private generateDiffHtml(original: string, modified: string): string {
        const patch = diff.createPatch('diff', original, modified);
        let html = '<pre><code>';
        const lines = patch.split('\n');
        let inHunk = false;
        
        lines.forEach(line => {
             if (line.startsWith('@@')) {
                 inHunk = true;
                 html += `${line}\n`;
                 return;
             }
             if (!inHunk) {
                 if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff') || line.startsWith('index')) {
                     return;
                 }
             }
             if (inHunk) {
                 if (line.startsWith('+') && !line.startsWith('+++')) {
                     html += `<span style="color: green;">${line}</span>\n`;
                 } else if (line.startsWith('-') && !line.startsWith('---')) {
                     html += `<span style="color: red;">${line}</span>\n`;
                 } else {
                     html += `${line}\n`;
                 }
             }
        });
        
        html += '</code></pre>';
        return html;
    }

    private async addMessageToHistory(message: ChatMessage): Promise<void> {
        // Deduplicate based on messageId if available
        if (message.messageId) {
            // Check session manager state directly
            const state = this.sessionManager.getState();
            if (state) {
                const exists = state.messages.some(m => m.messageId === message.messageId);
                if (exists) {
                    console.log(`[OrchestratorAgent] Skipping duplicate message with ID ${message.messageId}`);
                    return;
                }
            }
        }
        
        // Prevent adjacent duplicate user messages (content check fallback)
        const currentMessages = this.sessionManager.getState()?.messages || [];
        if (message.author === 'user' && currentMessages.length > 0) {
            const lastMsg = currentMessages[currentMessages.length - 1];
            if (lastMsg.author === 'user') {
                 const lastText = Array.isArray(lastMsg.content) 
                    ? lastMsg.content.map(c => (c as any).text).join('') 
                    : (lastMsg as any).text || '';
                 const newText = Array.isArray(message.content) 
                    ? message.content.map(c => (c as any).text).join('') 
                    : (message as any).text || '';
                 if (lastText === newText) {
                     console.log('[OrchestratorAgent] Skipping adjacent duplicate user message (content match)');
                     return;
                 }
            }
        }
        
        // Use SessionManager to add message
        await this.sessionManager.addMessage(message);

        // SDK Standard: Sync LLM History
        try {
            if (message.author === 'user') {
                const text = Array.isArray(message.content)
                    ? message.content.map((c: any) => typeof c === 'string' ? c : (c?.text ?? '')).filter(Boolean).join(' ')
                    : (typeof (message as any).text === 'string' ? (message as any).text : '');
                
                // Orchestrator manages llmConversationHistory in memory, so we update it
                if (text && !this.llmConversationHistory.some(m => m.role === 'user' && m.content === text)) {
                    this.llmConversationHistory.push({ role: 'user', content: text });
                    // Sync to SessionManager
                    await this.sessionManager.updateLlmHistory(this.llmConversationHistory);
                }
            } else if (message.author === 'agent') {
                // EXCLUSION: Do not add progress logs or code edits to LLM context
                // 'tool_trace' IS allowed because it contains actual tool outputs/errors needed for self-correction
                if (message.kind === 'progress' || message.kind === 'codeEditFile') {
                    return;
                }

                const text = Array.isArray(message.content)
                    ? message.content.map((c: any) => typeof c === 'string' ? c : (c?.text ?? '')).filter(Boolean).join(' ')
                    : (typeof (message as any).text === 'string' ? (message as any).text : '');
                if (text) {
                    const lastMsg = this.llmConversationHistory[this.llmConversationHistory.length - 1];
                    if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.content !== text) {
                        this.llmConversationHistory.push({ role: 'assistant', content: text });
                        this.pruneLlmHistoryIfNeeded();
                        await this.sessionManager.updateLlmHistory(this.llmConversationHistory);
                    }
                }
            }
        } catch (e) {
            console.warn('[OrchestratorAgent] Failed to sync message to llmConversationHistory:', e);
        }

        // Opportunistically refresh session title
        // Current logic in Orchestrator relies on state directly. Refactor to use SessionManager logic or keep local calc.
        // We'll keep local calc but use sessionManager.updateSessionTitle
        try {
            const activeId = this.sessionManager.getActiveSessionId();
            if (activeId) {
                let shouldDeriveTitle = false;
                // Only derive if message count is low or if it's the first message?
                // Old logic: "if message.author === 'user' { ... } else if agent ... "
                // Realistically, title should be derived from first user message.
                // Or we call `updateSessionTitleSummary` which uses LLM.
                // The old logic also had a simple heuristic title setter.
                
                // Let's call the AI summarizer
                (async () => { try { await this.updateSessionTitleSummary(); } catch {} })();
                
                // Simple heuristic title fallback if title is default?
                // We'll leave it to updateSessionTitleSummary for now or existing simple logic.
                // The old code had simple logic inside addMessageToHistory. 
                // Let's preserve the simple logic:
                if (message.author === 'user' || message.author === 'agent') {
                    // Only update if it's roughly the first message or so?
                    // The old logic just updated it every time? No, it seemed to just set it.
                    // Actually, it updated it locally in 'sessions' array then saved.
                    // We'll skip the simple heuristic and rely on updateSessionTitleSummary (AI) or assume SessionManager handles default.
                    // Or replicate simple logic:
                    let text = '';
                    if (Array.isArray(message.content)) {
                         text = message.content.map((c: any) => typeof c === 'string' ? c : (c?.text ?? '')).filter(Boolean).join(' ');
                    } else if (typeof (message as any).text === 'string') {
                         text = (message as any).text;
                    }
                    const firstLine = (text || '').split(/\r?\n/)[0].trim();
                    if (firstLine && currentMessages.length <= 1) { // Only first message
                         const maxLen = 60;
                         const summary = firstLine.length > maxLen ? firstLine.slice(0, maxLen - 1) + '…' : firstLine;
                         await this.sessionManager.updateSessionTitle(activeId, summary);
                    }
                }
            }
        } catch {}
    }

    /**
     * Prunes old system messages from llmConversationHistory if the context gets too long.
     * Keeps user and assistant messages but removes old system messages that are not essential.
     */
    private pruneLlmHistoryIfNeeded(): void {
        const threshold = this.configService.getContextTokenThreshold();

        // Rough estimation: 1 token ≈ 4 characters for English, use 3 for safety
        const estimatedTokens = this.llmConversationHistory.reduce((sum, msg) => {
            const contentLength = typeof msg.content === 'string' ? msg.content.length : 0;
            return sum + Math.ceil(contentLength / 3);
        }, 0);

        if (estimatedTokens > threshold) {
            // Remove old system messages (keep the most recent 5 system messages)
            let systemMessageCount = 0;
            const systemMessageIndices: number[] = [];

            for (let i = 0; i < this.llmConversationHistory.length; i++) {
                if (this.llmConversationHistory[i].role === 'system') {
                    systemMessageIndices.push(i);
                    systemMessageCount++;
                }
            }

            // Keep the last 5 system messages, remove older ones
            if (systemMessageCount > 5) {
                const messagesToRemove = systemMessageCount - 5;
                const indicesToRemove = systemMessageIndices.slice(0, messagesToRemove);

                // Remove in reverse order to maintain indices
                for (let i = indicesToRemove.length - 1; i >= 0; i--) {
                    this.llmConversationHistory.splice(indicesToRemove[i], 1);
                }

                this.developerLogService.log(`Pruned ${messagesToRemove} old system messages from LLM history to manage context length.`);
            }
        }
    }



    private getSessionChatHistoryKey(sessionId: string): string {
        return `session:${sessionId}:chatHistory`;
    }

    private getSessionLlmHistoryKey(sessionId: string): string {
        return `session:${sessionId}:llmHistory`;
    }

	private parseThoughtAndUserFacingText(rawContent: string | null): { thought?: string, userFacingText: string } {
		if (!rawContent) {
			return { userFacingText: '' };
		}

		        const thoughtRegex = /(<thought>[\s\S]*?<\/thought>)|(<THOUGHT>[\s\S]*?<\/THOUGHT>)|(<thinking>[\s\S]*?<\/thinking>)|(<THINKING>[\s\S]*?<\/THINKING>)|(<\|channel\|>analysis<\|message>[\s\S]*?<\|end\|>)/;
				let thoughtMatch = rawContent.match(thoughtRegex);

				let thought: string | undefined;
				let userFacingText = rawContent;

				if (thoughtMatch) {
					// capture group 1: <thought>, 2: <THOUGHT>, 3: <thinking>, 4: <THINKING>, 5: analysis channel
					const captured = thoughtMatch[1] || thoughtMatch[2] || thoughtMatch[3] || thoughtMatch[4] || thoughtMatch[5] || '';
					thought = captured
                        .replace(/^<\/?(THOUGHT|thought|THINKING|thinking)>/gi, '')
                        .replace(/<\/(THOUGHT|thought|THINKING|thinking)>$/i, '')
                        .trim();
					userFacingText = rawContent.replace(thoughtMatch[0], '').trim();
				} else if (rawContent.includes('<|end|>')) {
					// Handle delimiter style: [analysis]...<|end|><|start|>assistant<|channel|>final<|message|>...
					const parts = rawContent.split('<|end|>');
					const before = parts[0] ?? '';
					const after = parts.slice(1).join('<|end|>');
					// Treat 'before' as thought (strip channel markers)
					const stripMarkers = (s: string) => s
						.replace(/<\|start\|>.*?<\|message\|>/g, '')
						.replace(/<\|[^>]+\|>/g, '')
						.trim();
					const t = stripMarkers(before);
					if (t) { thought = t; }
					userFacingText = stripMarkers(after || rawContent);
				}

			// Strip channel markers and thought tags possibly left in either segment
			userFacingText = userFacingText
				.replace(/<\|[^>]+\|>/g, '')
				.replace(/<thought>[\s\S]*?<\/thought>/gi, '')
				.replace(/<THOUGHT>[\s\S]*?<\/THOUGHT>/gi, '')
                .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
                .replace(/<THINKING>[\s\S]*?<\/THINKING>/gi, '')
				.trim();

			// Remove duplicate thought content if it appears multiple times (language-independent)
			if (thought) {
				const thoughtTrimmed = thought.trim();
				if (thoughtTrimmed) {
					// Normalize whitespace for comparison
					const normalizeText = (text: string) => text.replace(/\s+/g, ' ').toLowerCase().trim();
					const normalizedThought = normalizeText(thoughtTrimmed);
					const normalizedUserText = normalizeText(userFacingText);

					// If thought content appears verbatim in userFacingText, remove it
					if (normalizedUserText.includes(normalizedThought)) {
						// Escape special regex characters and remove (case-insensitive, whitespace-tolerant)
						const escapedThought = thoughtTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
						// Match with flexible whitespace
						const flexiblePattern = escapedThought.replace(/\s+/g, '\\s+');
						userFacingText = userFacingText.replace(new RegExp(flexiblePattern, 'gi'), '').trim();
					}

					// Also check if thought content appears at the beginning of userFacingText (common pattern)
					// Remove leading thought-like explanations that duplicate the thought
					const thoughtSentences = thoughtTrimmed.split(/[.!?]\s+/).filter(s => s.length > 10);
					for (const sentence of thoughtSentences) {
						const normalizedSentence = normalizeText(sentence);
						if (normalizedUserText.startsWith(normalizedSentence) || normalizedUserText.includes(normalizedSentence + ' ')) {
							const escapedSentence = sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
							const flexibleSentencePattern = escapedSentence.replace(/\s+/g, '\\s+');
							userFacingText = userFacingText.replace(new RegExp(`^${flexibleSentencePattern}[.!?]?\\s*`, 'gi'), '').trim();
						}
					}
				}
			}

			// Remove FILE_CREATION_NEEDED tags (internal system tags should never be shown to users)
			const fileCreationRegex = /<FILE_CREATION_NEEDED>[\s\S]*?<\/FILE_CREATION_NEEDED>/gi;
			userFacingText = userFacingText.replace(fileCreationRegex, '').trim();

				// Strip common leaked prompt/instruction wrappers
				try {
					// Remove code fences while keeping inner content
					// userFacingText = userFacingText.replace(/```[a-zA-Z0-9]*\n([\s\S]*?)```/g, '$1').trim();
					// Remove obvious prompt echo patterns
					userFacingText = userFacingText.replace(/You are ChatGPT[\s\S]*?Question:[\s\S]*?\"/i, '').trim();
					userFacingText = userFacingText.replace(/prompt\s*=\s*"""[\s\S]*?"""/g, '').trim();
					userFacingText = userFacingText.replace(/print\(prompt,\s*end=\"\"\)[\s\S]*?$/m, '').trim();
					// Remove residual assistant channel labels like 'assistantfinal', 'assistant final', 'assistant: final'
					userFacingText = userFacingText.replace(/^(?:assistant\s*:?[\s_-]*final\s*|assistantfinal\s*|assistant\s*:\s*)/i, '').trim();
					// If there's an explicit "### Response:" marker, take the content after it
					const respIdx = userFacingText.indexOf('### Response:');
					if (respIdx !== -1) {
						userFacingText = userFacingText.slice(respIdx + '### Response:'.length).trim();
					}
					// Remove residual meta prefixes like 'Output: """' and trailing triple quotes
					userFacingText = userFacingText.replace(/^Output:\s*"""/i, '').replace(/"""\s*$/, '').trim();
				} catch {}

			return { thought, userFacingText };
	}

	private parseAndSendFinalResponse(rawContent: string | null): void {
		console.log(`[${OrchestratorAgent.AGENT_ID}] Raw LLM response content for final processing:`, rawContent);

		if (!rawContent) {
			this.developerLogService.log("Received null or empty content from LLM for final processing.");
            this._onDidPostMessage.fire({ command: 'responseEnd', payload: {} });
			return;
		}

		const { thought, userFacingText } = this.parseThoughtAndUserFacingText(rawContent);

		if (thought) {
			this.developerLogService.log(`LLM Thought: ${thought}`);
		}

		let textToDisplay = userFacingText.replace(/<\\\/?prunable>/g, '');

		if (!textToDisplay && thought) {
			textToDisplay = `I have processed the request. See my thought process for details.`;
		}

        const historyMessage: ChatMessage = {
            author: 'agent',
            content: [{ type: 'text', text: textToDisplay }],
            senderName: OrchestratorAgent.AGENT_ID,
            timestamp: new Date().toISOString()
        };
        this.addMessageToHistory(historyMessage);

        this._onDidPostMessage.fire({
            command: 'response',
            payload: { thought: thought, text: textToDisplay }
        });
    }

    private async sendPlanCompletionSummary(hasErrors: boolean): Promise<void> {
        if (this.isSendingPlanSummary) { return; }
        this.isSendingPlanSummary = true;
        try {
            try {
            const steps = Array.isArray(this.currentPlan) ? this.currentPlan : [];
            const done = steps.filter(s => s.status === 'completed').length;
            const failed = steps.filter(s => s.status === 'error').length;
            const remaining = steps.filter(s => s.status === 'pending' || s.status === 'in-progress').length;
            const artifacts = Array.from(this.producedArtifacts.entries());
            const ws = vscode.workspace.workspaceFolders;
            const root = ws?.[0]?.uri?.fsPath || '';
            const artifactsList = artifacts.map(([absOrRel, kind]) => {
                const abs = path.isAbsolute(absOrRel) ? absOrRel : (root ? path.resolve(root, absOrRel) : absOrRel);
                const rel = root ? path.relative(root, abs) : abs;
                const link = `file://${abs.replace(/\\/g, '/')}`;
                return { kind, abs, rel, link };
            });

            // SDK Standard: LLM will generate follow-up tasks based on artifacts

            // SDK Standard: LLM will generate follow-up tasks based on artifacts
            const sys = getPlanCompletionSummaryPrompt(vscode.env.language || 'en');

            const headerText = hasErrors ? AgentMessages.orchestrator.planCompletedErrors : AgentMessages.orchestrator.planCompletedSuccess;

            const data = {
                header: headerText,
                counts: { completed: done, failed, remaining },
                steps: steps.map(s => ({ description: s.description, status: s.status })),
                artifacts: artifactsList
            };

            const messages: LlmMessage[] = [
                { role: 'system', content: sys },
                { role: 'user', content: JSON.stringify(data) }
            ];

            let summary = '';
            try {
                const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
                const apiKeys = await this.configService.getApiKeys();
                const endpoint = this.configService.getEndpoint();
                const provider = this.configService.getLlmProvider();
                const timeout = this.configService.getRequestTimeout(OrchestratorAgent.AGENT_ID);
                const resp = await this.llmService.requestLLMCompletion(
                    provider,
                    messages,
                    apiKeys[0] || '',
                    endpoint,
                    [],
                    model,
                    undefined,
                    timeout,
                    {
                        onRetry: (attempt, maxRetries, error) => {
                            this._onDidPostMessage.fire({
                                command: 'progressLog',
                                payload: { text: `Request failed (attempt ${attempt}/${maxRetries}). Retrying... Error: ${error.message}` }
                            });
                        }
                    }
                );
                summary = (resp as any)?.choices?.[0]?.message?.content || '';
            } catch {}

            // Extract follow-up tasks from LLM response (numbered list)
            let extractedFollowUps: string[] = [];
            let nextActionSuggestion = '';
            if (summary && typeof summary === 'string') {
                const lines = summary.split('\n');
                const followUpPattern = /^\s*\d+\.\s*(.+)$/;
                const nextActionPattern = /^NEXT_ACTION_SUGGESTION:\s*(.+)$/;

                for (const line of lines) {
                    const match = line.match(followUpPattern);
                    if (match && match[1]) {
                        extractedFollowUps.push(match[1].trim());
                    }
                    const nextActionMatch = line.match(nextActionPattern);
                    if (nextActionMatch && nextActionMatch[1]) {
                        nextActionSuggestion = nextActionMatch[1].trim();
                    }
                }
                // Remove the NEXT_ACTION_SUGGESTION line from the displayed summary
                summary = summary.replace(/^NEXT_ACTION_SUGGESTION:.*$/gm, '').trim();
            }

            if (!summary || typeof summary !== 'string') {
                // Fallback to deterministic summary
                const lines: string[] = [];
                lines.push('# Plan Summary');
                lines.push(headerText);
                lines.push('');
                lines.push(`- Completed: ${done}`);
                lines.push(`- Failed: ${failed}`);
                lines.push(`- Remaining: ${remaining}`);
                if (steps.length > 0) {
                    lines.push('');
                    lines.push('## Steps');
                    for (const s of steps) {
                        const mark = s.status === 'completed' ? '[x]' : (s.status === 'error' ? '[!]' : '[ ]');
                        lines.push(`- ${mark} ${s.description}`);
                    }
                }
                if (artifactsList.length > 0) {
                    lines.push('');
                    lines.push('## Artifacts');
                    for (const a of artifactsList) {
                        lines.push(`- [${a.kind}] [${a.rel}](${a.link})`);
                    }
                }
                // Fallback: no hardcoded follow-ups in deterministic summary
                summary = lines.join('\n');
            }

            const historyMessage: ChatMessage = { author: 'agent', content: [{ type: 'text', text: summary }], senderName: OrchestratorAgent.AGENT_ID, timestamp: new Date().toISOString() } as any;
            (historyMessage as any).requiresUserInput = extractedFollowUps.length > 0;
            await this.addMessageToHistory(historyMessage);

            // When follow-ups exist (extracted from LLM response), set awaiting confirmation
            // BUT only if not suppressed (e.g. we just finished a follow-up plan)
            if (extractedFollowUps.length > 0 && !this.suppressPostActionsSuggestions) {
                this.pendingPostActions = extractedFollowUps;
                this.isAwaitingPostActionsConfirmation = true;
            } else if (this.suppressPostActionsSuggestions) {
                // If suppressed, clear any extracted follow-ups from the UI message to avoid confusion
                // (The summary text might still mention them, but we won't prompt for confirmation)
                this.pendingPostActions = [];
                this.isAwaitingPostActionsConfirmation = false;
                // Also ensure requiresUserInput is false if we are not asking for confirmation
                (historyMessage as any).requiresUserInput = false;
                // Update the response payload as well
                this._onDidPostMessage.fire({ command: 'response', payload: { text: summary, senderName: historyMessage.senderName, timestamp: historyMessage.timestamp, requiresUserInput: false, nextActionSuggestion } });
                return; // Return early to avoid firing the second response event below
            }

            // Update session title summary after plan completion
            await this.updateSessionTitleSummary();

            // Log a concise summary line to the progress log
            const logLine = `${headerText} (completed=${done}, failed=${failed}, remaining=${remaining}, followUps=${extractedFollowUps.length})`;
            this._onDidPostMessage.fire({ command: 'progressLog', payload: { text: logLine } });

            this._onDidPostMessage.fire({ command: 'response', payload: { text: summary, senderName: historyMessage.senderName, timestamp: historyMessage.timestamp, requiresUserInput: extractedFollowUps.length > 0, nextActionSuggestion } });
            } catch (e) {
                this.parseAndSendFinalResponse(hasErrors ? 'Plan completed with some errors.' : 'All steps completed successfully.');
            }
        } finally {
            this.isSendingPlanSummary = false;
        }
    }

    private recordArtifact(filePath: string, action: 'created' | 'updated'): void {
        try {
            const ws = vscode.workspace.workspaceFolders;
            const root = ws?.[0]?.uri?.fsPath || '';
            const abs = path.isAbsolute(filePath) ? filePath : (root ? path.resolve(root, filePath) : filePath);
            this.lastContextFilePath = abs; // Always persist latest context
            this.lastAppliedFilePath = abs; // Update last applied file path

            // Track Source File (heuristic: likely source code, not test, not artifact)
            // Extensions: .ts, .tsx, .js, .jsx, .py, .java, .c, .cpp, .h, .cs, .go, .rs, .php, .rb, .swift
            // Exclude: .test., .spec., .d.ts
            const base = path.basename(abs).toLowerCase();
            const ext = path.extname(abs).toLowerCase();
            const isSourceExt = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs', '.php', '.rb', '.swift'].includes(ext);
            const isTest = base.includes('.test.') || base.includes('.spec.') || base.startsWith('test_');
            const isDef = base.endsWith('.d.ts');
            
            if (isSourceExt && !isTest && !isDef) {
                this.lastSourceFilePath = abs;
                this.developerLogService.log(`[OrchestratorAgent] Updated lastSourceFilePath: ${abs}`);
            }

            this.developerLogService.log(`[OrchestratorAgent] recordArtifact: ${abs} (${action})`);
            const prev = this.producedArtifacts.get(abs);
            if (prev === 'created') { return; }
            this.producedArtifacts.set(abs, action);
        } catch {}
    }

    /**
     * Plan이 없는 경우 (direct dispatch) 요약 생성
     */






	private handleError(error: any): void {
        console.error(error);
        this.developerLogService.log(`Error: ${error.message}`);
        this._onDidPostMessage.fire({
            command: 'displayError',
            payload: {
                message: error.message || 'An unknown error occurred.'
            }
        });
	}





    /**
     * Send update-task command to TaskDecompositionAgent to update TASK.md checkbox
     */
    private async updateTaskMd(index: number, description: string): Promise<void> {
        try {
            await this.dispatch({
                messageId: uuidv4(),
                sender: OrchestratorAgent.AGENT_ID,
                recipient: 'TaskDecompositionAgent',
                timestamp: new Date().toISOString(),
                // contextId: uuidv4(), // Removed as it's not in A2AMessage interface
                type: 'update-task',
                payload: {
                    index,
                    description,
                    status: 'completed'
                }
            });
        } catch (e) {
            this.developerLogService.log(`[OrchestratorAgent] updateTaskMd failed: ${e}`);
        }
    }




    private async saveCurrentChatHistory(): Promise<void> {
        if (this.activeSessionId) {
            await this.sessionManager.overwriteMessages(this.activeSessionId, this.chatHistory);
        }
    }

    private async saveCurrentLlmHistory(): Promise<void> {
        if (this.activeSessionId) {
            await this.sessionManager.updateLlmHistory(this.llmConversationHistory);
        }
    }







    /**
     * Updates the current plan programmatically (e.g., from TaskDecompositionAgent).
     * @param steps List of step descriptions (strings) or partial step objects
     * @param startImmediately If true, begins execution of the first pending step immediately.
     */
    public async updatePlan(steps: any[], startImmediately: boolean = false): Promise<void> {
        this.developerLogService.log(`[OrchestratorAgent] updatePlan: Updating with ${steps.length} steps. startImmediately=${startImmediately}`);
        
        if (!steps || steps.length === 0) {
            this.developerLogService.log(`[OrchestratorAgent] updatePlan: Received empty steps, skipping.`);
            return;
        }

        this.planId = uuidv4();
        // Reset state
        this.currentStepIndex = -1;
        this.currentExecutionId = '';
        this.producedArtifacts.clear();
        this.retriedSteps.clear();

        this.currentPlan = steps.map((s, i) => {
            const description = typeof s === 'string' ? s : (s.description || s.task || '');
            const targetAgent = typeof s === 'string' ? 'BrainstormAgent' : (s.targetAgent || s.target_agent || 'BrainstormAgent');
            return {
                id: `${this.planId}:${i + 1}`,
                description,
                status: 'pending',
                targetAgent
            };
        });

        this.pendingPlan = null;
        this.isAwaitingPlanConfirmation = false;

        // UI에 플랜 표시
        this._onDidPostMessage.fire({ 
            command: 'displayPlan', 
            payload: { plan: this.currentPlan } 
        });

        // 텍스트 로그 출력
        this._onDidPostMessage.fire({ 
            command: 'progressLog', 
            payload: { text: `📋 New plan created with ${steps.length} steps.` } 
        });

        await this.saveCurrentChatHistory();

        if (startImmediately) {
            await this.executePlan();
        }
    }

    private async executePlan(): Promise<void> {
        if (this.cancellationTokenSource && this.cancellationTokenSource.token.isCancellationRequested) {
             this.developerLogService.log('[OrchestratorAgent] Plan execution cancelled via token.');
             return;
        }

        this.developerLogService.log(`[OrchestratorAgent] executePlan: currentStepIndex=${this.currentStepIndex}`);
        
        if (!this.currentPlan || this.currentPlan.length === 0) {
            this.developerLogService.log(`[OrchestratorAgent] executePlan: No plan to execute.`);
            return;
        }

        // Find first pending step
        const nextIndex = this.currentPlan.findIndex(s => s.status === 'pending');
        if (nextIndex === -1) {
            this.developerLogService.log(`[OrchestratorAgent] executePlan: No more pending steps.`);
            return;
        }

        this.currentStepIndex = nextIndex;
        const step = this.currentPlan[nextIndex];
        
        // Mark as in-progress
        step.status = 'in-progress';
        step.executionId = uuidv4();
        this.currentExecutionId = step.executionId;

        this.developerLogService.log(`[OrchestratorAgent] Executing Step ${nextIndex + 1}: ${step.description} -> ${step.targetAgent}`);

        // Update UI
        this._onDidPostMessage.fire({ 
            command: 'updatePlanStep', 
            payload: { index: nextIndex, status: 'in-progress' } 
        });

        this._onDidPostMessage.fire({ 
            command: 'progressLog', 
            payload: { text: `Step ${nextIndex + 1}: ${step.description}` } 
        });

        // Delegate to Specialist Agent
        const targetAgent = step.targetAgent || 'BrainstormAgent';
        
        await this.dispatch({
            messageId: uuidv4(),
            sender: OrchestratorAgent.AGENT_ID,
            recipient: targetAgent,
            timestamp: new Date().toISOString(),
            // contextId: uuidv4(), // Removed as it's not in A2AMessage interface
            type: 'task', // Unified task type
            payload: {
                task: step.description,
                context: `Step ${nextIndex + 1} of current orchestration plan.`,
                correlationId: step.executionId,
                targetFile: this.lastSourceFilePath || this.lastContextFilePath,
                relatedFiles: this.lastAttachmentFilePaths
            }
        });
    }




    // --- Unified "Function A" Implementation ---



    protected async getTools(userInput: string, requestContext: RequestContext): Promise<any[]> {
        // Orchestrator needs core tools (especially semantic search & notify_user) to handle knowledge gaps
        // and communicate effectively, even if its main output is JSON planning.
        const { getCoreLLMTools } = require('../services/LLMTools');
        const coreTools = getCoreLLMTools();
        return coreTools;
    }



    public async cancelTask(): Promise<void> {
        // Implement cancellation logic
    }

    // --- Helper Methods ---

    // Removed duplicates: recordArtifact (4486), handleError (duplicate), sendPlanCompletionSummary (4333)
    // kept postMessageToSession as it was missing in middle

    private postMessageToSession(sessionId: string, command: string, payload: any): void {
        if (sessionId === this.activeSessionId) {
            this._onDidPostMessage.fire({ command, payload });
        }
    }
    
    // Removed duplicates: parseThoughtAndUserFacingText (4197), pruneLlmHistoryIfNeeded (4141)
    // Removed duplicate: parseAndSendFinalResponse (4298)
    public async handleA2AMessage(message: A2AMessage<any>): Promise<void> {
        this.developerLogService.log(`[Orchestrator] Received A2A Message from ${message.sender}: ${message.type}`);
        
        switch (message.type) {
            case 'status-stream':
                // Handle streaming chunks
                const isStreamContent = message.payload?.content;
                if (isStreamContent) {
                    // Use processProgressLogChunk to append text to the latest log
                    // Note: If BaseAgent sends prefix in first chunk, it might be separate.
                    // But BaseAgent logic says: if isStreaming, it sends RAW content. 
                    // So we might want to manually prepend prefix ONLY for the first chunk if needed, 
                    // OR we just assume the UI handles appending.
                    // For now, let's keep it simple: just append what we get.
                    // But we likely want to verify sender name prefix logic in processProgressLogChunk?
                    // Actually, processProgressLog has prefix logic, but processProgressLogChunk usually assumes appending to *active* log.
                    // Let's implement processProgressLogChunk (or check if it exists or use direct fire).
                    // Orchestrator doesn't have processProgressLogChunk method visible in my view earlier (I only saw processProgressLog).
                    // I'll assume I need to implement it or use _onDidPostMessage directly.
                    
                    // Direct fire to UI
                    this._onDidPostMessage.fire({ 
                        command: 'progressLogChunk', 
                        payload: { 
                            text: isStreamContent 
                        } 
                    });
                }
                break;
            case 'progress': // Legacy
            case 'status-update': // SDK Standard (Full Update)
                const payload = message.payload || {};
                const progressText = payload.status?.message?.parts?.find((p: any) => p.kind === 'text')?.text || 
                                   payload.message?.parts?.find((p: any) => p.kind === 'text')?.text ||
                                   payload.data || payload.text || "";
                
                if (progressText) {
                    this.processProgressLog(progressText, message.sender || 'Agent');
                }
                break;
            case 'resource-action':
                // Handle File Creation/Update from workers -> UI Block
                if (message.payload?.uri) {
                    const absPath = message.payload.uri;
                    const action = message.payload.action || "create";
                    const historyMsg: any = {
                        author: 'agent',
                        kind: 'codeEditFile', // Re-use for UI Block
                        senderName: message.sender || OrchestratorAgent.AGENT_ID,
                        timestamp: message.payload.timestamp || new Date().toISOString(),
                        filePath: absPath,
                        content: [{ type: 'text', text: `${action === 'create' ? 'Created' : 'Updated'} file: ${path.basename(absPath)}` }]
                    };
                    await this.addMessageToHistory(historyMsg);
                    this._onDidPostMessage.fire({ command: 'createFileCard', payload: historyMsg });
                }
                break;
            case 'propose-task':
                const tasks = message.payload?.tasks || message.payload?.new_steps || [];
                const reason = message.payload?.reason || "New tasks proposed";
                if (tasks.length > 0) {
                     this._onDidPostMessage.fire({ command: 'progressLog', payload: { text: `${message.sender}: ${reason}` } });
                     await this.updatePlan(tasks, true);
                }
                break;
             case 'response-code-execution':
             case 'report': // Show Agent Reports as Chat Bubbles
                const reportText = message.payload?.message || message.payload?.result || message.payload?.text || message.payload?.data || JSON.stringify(message.payload);
                if (reportText) {
                    const reportMsg: any = {
                        author: 'agent',
                        senderName: message.sender,
                        content: [{ type: 'text', text: reportText }],
                        timestamp: new Date().toISOString(),
                        kind: 'text' // Standard chat bubble
                    };
                    await this.addMessageToHistory(reportMsg);
                    // Force UI update
                    // this._onDidPostMessage.fire({ command: 'loadHistory', payload: this.chatHistory }); // handleSessionChangeProxy already does this on state change?
                    // But explicitly firing response helps real-time feel if generic
                     this._onDidPostMessage.fire({ 
                        command: 'response', 
                        payload: { text: reportText, senderName: message.sender, timestamp: reportMsg.timestamp } 
                    });
                }
                break;
             case 'execution-result':
                const executionId = message.payload?.correlationId;
                if (executionId && this.currentPlan) {
                     const stepIndex = this.currentPlan.findIndex((s) => s.executionId === executionId);
                     if (stepIndex !== -1) {
                         const success = message.payload.success;
                         this.currentPlan[stepIndex].status = success ? 'completed' : 'error';
                         this._onDidPostMessage.fire({ 
                            command: 'updatePlanStep', 
                            payload: { index: stepIndex, status: this.currentPlan[stepIndex].status } 
                         });
                         await this.executePlan();
                     }
                }
                break;
        }
    }

    private async runLintForFile(_filePath: string): Promise<void> {
        this.developerLogService.log(`[OrchestratorAgent] runLintForFile placeholder called for ${_filePath}`);
        // Implementation logic for linting if needed
    }

    private buildDynamicPostActionsFromArtifacts(): string[] {
        this.developerLogService.log(`[OrchestratorAgent] buildDynamicPostActionsFromArtifacts placeholder called`);
        // Implementation logic for dynamic post-actions
        return [];
    }

    private async handlePostActionsConfirmation(userText: string): Promise<boolean> {
        return this.handlePlanConfirmation(userText);
    }

    // --- Validation Override ---
    protected validateA2AResponse(text: string): { valid: boolean; error?: string } {
        const baseValidation = super.validateA2AResponse(text);
        if (!baseValidation.valid) {
            return baseValidation;
        }

        try {
            const parsed = JSON.parse(text);
            
            // 1. Delegation Consistency Check
            if (parsed.type === 'delegation' && parsed.targetAgent === 'None') {
                return { 
                    valid: false, 
                    error: "Invalid Delegation: You set 'type': 'delegation' but 'targetAgent': 'None'. If you intend to delegate, you MUST specify a valid 'targetAgent' from the list (e.g., 'CodeEditAgent', 'BrainstormAgent'). If you intend to answer directly (or report), set 'targetAgent': 'None' and 'type': 'report' (or 'answer')." 
                };
            }

            // 2. Target Agent Validity Check
            if (parsed.targetAgent && parsed.targetAgent !== 'None') {
                const validAgents = OrchestratorAgent.SPECIALIST_AGENTS.map(a => a.name);
                if (!validAgents.includes(parsed.targetAgent)) {
                     return {
                        valid: false,
                        error: `Invalid targetAgent '${parsed.targetAgent}'. Valid agents show in system prompt are: ${validAgents.join(', ')}.`
                     };
                }
            }

            return { valid: true };
        } catch (e: any) {
            return { valid: false, error: `Validation Error: ${e.message}` };
        }
    }
}
