import * as vscode from 'vscode';
import { getTaskTypePrompt } from '../prompts/sections/TaskClassification';
import { getConversationalPrompt } from '../prompts/sections/Conversational';
import { getPlanPrompt } from '../prompts/sections/Planning';
import { getRoutingPrompt } from '../prompts/sections/Routing';
import { getPostActionsSelectionPrompt } from '../prompts/sections/PostActions';
import { getPlanCompletionSummaryPrompt } from '../prompts/sections/Summary';

import * as fs from 'fs/promises';
import * as path from 'path';

import { A2AMessage } from '../interfaces/A2AMessage';
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
import { getCoreLLMTools } from '../services/LLMTools';
import { CheckpointService, AgentState } from '../services/CheckpointService';
import { ContextService } from '../services/ContextService';
import { messages as AgentMessages } from '../messages';

// --- Type Definitions ---
type ChatMessage = { 
    author: 'user' | 'agent'; 
    content: any[]; 
    thought?: string; 
    senderName?: string; 
    timestamp?: string; 
    kind?: 'progress' | 'normal' | 'uroboros-proposal' | 'task' | 'codeEditFile'; 
    messageId?: string;
    buttons?: Array<{ label: string; command: string; payload?: any; style?: 'primary' | 'secondary' | 'danger' }>;
};

const SLASH_COMMANDS = [
    { command: '/test health', description: 'Run a health check on all specialist agents.' },
    { command: '/test diff', description: 'Test the diff UI.' },
    { command: '/test process', description: 'Test the thinking process UI.' },
    { command: '/test command', description: 'Test the command execution confirmation UI.' },
    { command: '/test usage', description: 'Show estimated main context tokens and actual used tokens.' },
    { command: '/mcp', description: 'Check MCP status (Not implemented).' },
    { command: '/a2a', description: 'Check A2A status (Not implemented).' },
    { command: '/remember', description: 'Save a piece of information to the agent\'s memory.' },
    { command: '/help', description: 'Show this list of available commands.' }
];

/**
 * @class OrchestratorAgent
 * @description The master agent that coordinates all other agents and services.
 */
export class OrchestratorAgent {
	private static readonly AGENT_ID = 'OrchestratorAgent';
	private static readonly SESSIONS_INDEX_KEY = 'aiPartnerChatSessionsIndex';
	private static readonly ACTIVE_SESSION_ID_KEY = 'aiPartnerActiveChatSessionId';
    private static readonly LAST_SOURCE_FILE_KEY = 'aiPartnerLastSourceFilePath';
    private static readonly SPECIALIST_AGENTS: { name: string; description: string; }[] = [];
    
    // synchronous debounce for user queries to prevent race-condition duplicates
    private recentQueryDebounce = new Set<string>();

	private readonly _onDidPostMessage = new vscode.EventEmitter<any>();
    public readonly onDidPostMessage = this._onDidPostMessage.event;

    private postMessageToSession(sessionId: string, command: string, payload: any) {
        this._onDidPostMessage.fire({ command, payload, sessionId });
    }

	private dispatch: (message: A2AMessage<any>) => Promise<void>;
	private mcpServer: mcpServerModule.Server;
    private llmService: LLMService;
	private authService: AuthService;
	private configService: ConfigService;
	private state: vscode.Memento;
	private diagnosticCollection: vscode.DiagnosticCollection;
	private developerLogService: DeveloperLogService;
    private checkpointService: CheckpointService;
    private contextService: ContextService;
    private chatHistory: ChatMessage[] = [];
    private llmConversationHistory: LlmMessage[] = [];
    private alwaysAcceptSuggestions: Set<string> = new Set();
	private pendingPlan: any[] | null = null;
	private isAcceptAlwaysActive: boolean = false;
    private pendingUroborosProposal: { userText: string } | null = null;
	private currentPlan: { id: string; description: string; status: string; executionId?: string }[] = [];
	private planKind: 'main' | 'post' | '' = '';
	private hasExecutedCoreFollowups: boolean = false;
	private lastPlanSummary: string = '';
	private _specialistAgentDescriptions: string = '';
    private isAwaitingPlanConfirmation: boolean = false;
    private autonomousMode: boolean = false;
    private activeSessionId: string = ''; // New member

    private lastAttachmentFilePaths: string[] = [];
    private lastImageAttachments: Array<{ url: string; label: string }> = [];
    // Guard against unintended automatic re-dispatch
    private lastUserInputAt: number = 0;
    private lastDispatchedStep: string = '';
    private lastDispatchedAt: number = 0;
    private lastAppliedFilePath: string = '';
    private lastSourceFilePath?: string; // Track last known source file for smart swapping
    private lastContextFilePath: string | undefined = ''; // Persistent file context across plans
    private recentlyAppliedFiles: Map<string, number> = new Map();
    // Correlation for robust idempotency (no time guards)
    private planId: string = '';
    private currentStepIndex: number = -1;
    private currentExecutionId: string = '';
    private handledExecutions: Set<string> = new Set();
    private retriedSteps: Set<string> = new Set();
    private producedArtifacts: Map<string, 'created' | 'updated'> = new Map();
    private deferredPostActions: string[] = [];
    private isAwaitingPostActionsConfirmation: boolean = false;
    private pendingPostActions: string[] = [];
    private suppressPostActionsSuggestions: boolean = false;
    private isSendingPlanSummary: boolean = false;
    // Sticky routing: while an agent requires user input (e.g., BrainstormAgent), route user messages back
    private stickyAgentName: string = '';
    private lastUserQuery: string = '';  // Store original user query for BrainstormAgent
    private stickyExpiresAt: number = 0;
    // Brainstorm interactive conversation context
    private brainstormContextId: string = '';
	// Track recent structured messages (propose-task, propose-plan) to suppress duplicate status messages
	private recentStructuredMessages: Map<string, { timestamp: number; sender: string }> = new Map();

	// Complexity prompt suppression (session-scoped)
	private sessionSuppressComplexityPrompt: boolean = false;
	// Track declined Uroboros proposals for specific queries to avoid re-proposing
	private declinedUroborosQueries: Set<string> = new Set();
	// External A2A agents loaded from a2a-servers.json
	private externalAgents: Map<string, { name: string; description: string; url: string }> = new Map();
    private isCompletingPlan: boolean = false;


	constructor(
		dispatch: (message: A2AMessage<any>) => Promise<void>,
		mcpServer: mcpServerModule.Server,
		llmService: LLMService,
		authService: AuthService,
		configService: ConfigService,
		state: vscode.Memento,
		diagnosticCollection: vscode.DiagnosticCollection,
		developerLogService: DeveloperLogService,
		externalAgents?: Map<string, { name: string; description: string; url: string }>
	) {
		this.dispatch = dispatch;
		this.mcpServer = mcpServer;
		this.llmService = llmService;
		this.authService = authService;
		this.configService = configService;
		this.state = state;
		this.diagnosticCollection = diagnosticCollection;
		this.diagnosticCollection = diagnosticCollection;
		this.developerLogService = developerLogService;
        this.checkpointService = new CheckpointService();
        this.contextService = new ContextService();
		this.externalAgents = externalAgents || new Map();  // Initialize external agents
		// this.commentGenerationAgent = new CommentGenerationAgent(this.dispatch, this.mcpServer, this.llmService);
        // console.log('[OrchestratorAgent] constructor this.state:', this.state);
	}

    public async initialize(registeredAgentConfigs: { name: string; description: string; }[]): Promise<void> {
        await this.loadOrInitializeSession();
        // const agents = await this.getSpecialistAgents(); // No longer needed as agents are passed in
        if (OrchestratorAgent.SPECIALIST_AGENTS.length === 0) { // Prevent duplicates on re-initialization
            OrchestratorAgent.SPECIALIST_AGENTS.push(...registeredAgentConfigs.filter(a => a.name !== OrchestratorAgent.AGENT_ID));
        }
        this._specialistAgentDescriptions = OrchestratorAgent.SPECIALIST_AGENTS.map(agent => `- ${agent.name}: ${agent.description}`).join('\n');
    }


	private async loadOrInitializeSession(): Promise<void> {
        // console.log('[OrchestratorAgent] loadOrInitializeSession, this.state:', this.state);
		let activeId = this.state.get<string>(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, '');
		let sessions = this.state.get<any[]>(OrchestratorAgent.SESSIONS_INDEX_KEY, []) || [];
        // console.log('[OrchestratorAgent] loadOrInitializeSession: before init', { activeId, sessionsLen: sessions.length });

		if (sessions.length === 0) {
			// No sessions at all -> create the first one
			const now = new Date();
			activeId = `session-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
			const meta = { id: activeId, title: `Chat ${now.toLocaleString()}`, createdAt: now.toISOString(), messageCount: 0 };
			sessions.push(meta);
			await this.state.update(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, activeId);
			await this.state.update(OrchestratorAgent.SESSIONS_INDEX_KEY, sessions);
			this.chatHistory = [];
			this.llmConversationHistory = [];
			await this.state.update(this.getSessionChatHistoryKey(activeId), this.chatHistory);
			await this.state.update(this.getSessionLlmHistoryKey(activeId), this.llmConversationHistory);
			this.activeSessionId = activeId; // Assign to class member
			// console.log('[OrchestratorAgent] loadOrInitializeSession: created first session', { activeId });
		} else if (!activeId || !sessions.find(s => s.id === activeId)) {
			// Sessions exist but activeId is missing or invalid -> pick the most recent existing session
			activeId = sessions[sessions.length - 1].id;
			await this.state.update(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, activeId);
			this.activeSessionId = activeId;
			// console.log('[OrchestratorAgent] loadOrInitializeSession: selected existing latest session as active', { activeId });
		} else {
			this.activeSessionId = activeId; // Assign to class member for existing session
			// console.log('[OrchestratorAgent] loadOrInitializeSession: using existing active session', { activeId });
		}

		this.chatHistory = this.state.get<ChatMessage[]>(this.getSessionChatHistoryKey(activeId), []);
        this.llmConversationHistory = this.state.get<LlmMessage[]>(this.getSessionLlmHistoryKey(activeId), []);
        this.lastSourceFilePath = this.state.get<string>(OrchestratorAgent.LAST_SOURCE_FILE_KEY, undefined);
        this.alwaysAcceptSuggestions = new Set();
		this.isAcceptAlwaysActive = false;
	}

    public async handleSessionChange(): Promise<void> {
        await this.sendFullSettingsToUI();
        let sessions = this.state.get<any[]>(OrchestratorAgent.SESSIONS_INDEX_KEY, []) || [];
        // Sanitize sessions
        sessions = sessions.filter(s => s && typeof s.id === 'string' && typeof s.title === 'string').map(s => ({
            ...s,
            createdAt: (s.createdAt && !isNaN(new Date(s.createdAt).getTime())) ? s.createdAt : new Date().toISOString(),
            messageCount: typeof s.messageCount === 'number' ? s.messageCount : 0
        }));
        
        const activeId = this.state.get<string>(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, '');
        this._onDidPostMessage.fire({ command: 'historyList', payload: { sessions, activeId } });
        
        // Sanitize chat history
        // Sanitize chat history strictly to prevent UI crashes
        const safeHistory = (this.chatHistory || []).map(msg => {
            if (!msg || typeof msg !== 'object') return null;
            
            // Ensure content is array
            let content = Array.isArray(msg.content) ? msg.content : [];
            
            // Sanitize content items
            content = content.map((c: any) => {
                if (!c || typeof c !== 'object') return null;
                if (c.type === 'text') {
                    return { ...c, text: typeof c.text === 'string' ? c.text : '' };
                }
                // Pass through other types (e.g. image_url) but ensure they are objects
                return c;
            }).filter((c: any) => c !== null);

            return {
                ...msg,
                senderName: typeof msg.senderName === 'string' ? msg.senderName : (msg.author === 'user' ? 'User' : 'Viper'),
                author: typeof msg.author === 'string' ? msg.author : 'agent',
                content: content,
                timestamp: (msg.timestamp && !isNaN(new Date(msg.timestamp).getTime())) ? msg.timestamp : new Date().toISOString(),
                kind: typeof msg.kind === 'string' ? msg.kind : undefined,
                filePath: typeof msg.filePath === 'string' ? msg.filePath : undefined
            };
        }).filter(msg => msg !== null);

        this._onDidPostMessage.fire({ command: 'loadHistory', payload: safeHistory });
        // console.log('[OrchestratorAgent] Fired loadHistory with safeHistory length:', safeHistory.length);
    }

    private processProgressLog(msg: string, sender: string, sessionId: string = this.activeSessionId): void {
        // SDK standard: status-update messages are always shown as progress logs
        // No filtering needed - all status-update messages should be displayed
        if (!msg || !msg.trim()) {
            return;
        }

        // Show as progress log
        this.postMessageToSession(sessionId, 'progressLog', { text: msg });

        // Persist progress log to chat history so it survives reloads
        const historyMsg: ChatMessage = {
            author: 'agent',
            content: [{ type: 'text', text: msg }],
            senderName: (msg.match(/^\[([^\]]+)/)?.[1]) || sender,
            timestamp: new Date().toISOString(),
            kind: 'progress'
        } as any;
        (async () => {
            try {
                await this.addMessageToHistory(historyMsg);
            } catch (err) {
                console.warn('[OrchestratorAgent] Failed to persist progress log history entry', err);
            }
        })();
    }

    private processProgressLogChunk(msg: string, _sender: string, sessionId: string = this.activeSessionId): void {
        if (!msg) return;
        this.postMessageToSession(sessionId, 'progressLogChunk', { text: msg });
    }



    public async handleUIMessage(message: any): Promise<void> {
        // console.log(`[${OrchestratorAgent.AGENT_ID}] Received message from ViewProvider:`, message);

					switch (message.command) {
            case 'loadInitialData':
                // Send current settings and history to UI on initial load
                await this.handleSessionChange();
                break;
            case 'requestHistory':
                // Explicit history reload request from UI
                await this.handleSessionChange();
                break;
            case 'newChat': {
                try {
                    const now = new Date();
                    const newId = `session-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
                    const sessions = this.state.get<any[]>(OrchestratorAgent.SESSIONS_INDEX_KEY, []) || [];
                    const meta = { id: newId, title: `Chat ${now.toLocaleString()}`, createdAt: now.toISOString(), messageCount: 0 };
                    sessions.push(meta);
                    await this.state.update(OrchestratorAgent.SESSIONS_INDEX_KEY, sessions);
                    await this.state.update(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, newId);
                    this.activeSessionId = newId;
                    // Reset histories for the new session
                    this.chatHistory = [];
                    this.llmConversationHistory = [];
                    this.sessionSuppressComplexityPrompt = false; // 새 세션에서는 제안 활성화
                    this.declinedUroborosQueries.clear(); // 새 세션에서는 거절 기록 초기화
                    
                    // [Bug Fix] Reset all execution state to prevent zombie context leaking into new session
                    this.currentPlan = [];
                    this.pendingPlan = null;
                    this.planKind = '';
                    this.hasExecutedCoreFollowups = false;
                    this.lastPlanSummary = '';
                    this.isAwaitingPlanConfirmation = false;
                    this.isAwaitingPostActionsConfirmation = false;
                    this.pendingPostActions = null;
                    this.autonomousMode = false;
                    this.pendingUroborosProposal = null;
                    this.lastAttachmentFilePaths = [];
                    this.lastImageAttachments = [];
                    this.isAcceptAlwaysActive = false;
                    this.alwaysAcceptSuggestions.clear();
                    
                    // Reset ContextService state
                    if (this.contextService) {
                        this.contextService.resetContext();
                    }

                    await this.state.update(this.getSessionChatHistoryKey(newId), this.chatHistory);
                    await this.state.update(this.getSessionLlmHistoryKey(newId), this.llmConversationHistory);
                    if (message.initialQuery) {
                        const query = message.initialQuery.trim();
                        if (query) {
                            // Hand off handling (and persistence) to the main handler
                            await this.handleChatAndSpecialistCommands(query, message.messageId);
                        }
                    }
                    await this.handleSessionChange();
                    this.developerLogService.log(`[OrchestratorAgent] Created new chat session ${newId}.`);
                } catch (e: any) {
                    this.developerLogService.log(`[OrchestratorAgent] Failed to create new chat session: ${e?.message || e}`);
                }
                break;
            }
            case 'selectChat': {
                try {
                    const targetId = typeof message.sessionId === 'string' ? message.sessionId : '';
                    if (!targetId) { break; }
                    const sessions = this.state.get<any[]>(OrchestratorAgent.SESSIONS_INDEX_KEY, []) || [];
                    if (!sessions.find(s => s.id === targetId)) { break; }
                    await this.state.update(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, targetId);
                    this.activeSessionId = targetId;
                    this.chatHistory = this.state.get<ChatMessage[]>(this.getSessionChatHistoryKey(targetId), []);
                    this.llmConversationHistory = this.state.get<LlmMessage[]>(this.getSessionLlmHistoryKey(targetId), []);
                    this.alwaysAcceptSuggestions = new Set();
                    this.isAcceptAlwaysActive = false;
                    this.sessionSuppressComplexityPrompt = false; // 세션 전환 시 리셋 (또는 세션별로 저장할 수도 있음)
                    this.declinedUroborosQueries.clear(); // 세션 전환 시 거절 기록 초기화
                    await this.handleSessionChange();
                    this.developerLogService.log(`[OrchestratorAgent] Switched active chat session to ${targetId}.`);
                } catch (e: any) {
                    this.developerLogService.log(`[OrchestratorAgent] Failed to switch chat session: ${e?.message || e}`);
                }
                break;
            }
            case 'deleteChat': {
                try {
                    const targetId = typeof message.sessionId === 'string' ? message.sessionId : this.activeSessionId;

                    // Notify UI with updated session list
                    await this.handleSessionChange();
                    this.developerLogService.log(`[OrchestratorAgent] Deleted chat session ${targetId}. New active: ${newActiveId}.`);
                } catch (e: any) {
                    this.developerLogService.log(`[OrchestratorAgent] Failed to delete chat session: ${e?.message || e}`);
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
                    await this.routeAndDelegate(userText);
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

    public async handleA2AMessage(message: A2AMessage<any>): Promise<void> {
        this.developerLogService.log(`[OrchestratorAgent] Received A2A message from ${message.sender}: ${message.type}`);

        try {
            try {
                const corr = (message as any)?.payload?.correlation;
                const payloadPreview = (() => { try { return JSON.stringify((message as any)?.payload).slice(0, 600); } catch { return ''; } })();
                console.log('[OrchestratorAgent] A2A received', {
                    sender: message.sender,
                    type: message.type,
                    hasPayload: !!(message as any)?.payload,
                    payloadPreview,
                    correlation: corr ? { planId: corr.planId || corr.workflowId, stepId: corr.stepId, exec: corr.executionId || corr.runId, sessionId: corr.sessionId } : undefined
                });
            } catch {}
            // Sticky session routing: if correlation includes a sessionId, ensure we are operating on that session
            try {
                const targetSessionId = (message as any)?.payload?.correlation?.sessionId;
                if (typeof targetSessionId === 'string' && targetSessionId && targetSessionId !== this.activeSessionId) {
                    await this.state.update(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, targetSessionId);
                    this.activeSessionId = targetSessionId;
                    // Load histories of the target session before appending any messages
                    this.chatHistory = this.state.get<ChatMessage[]>(this.getSessionChatHistoryKey(targetSessionId), []);
                    this.llmConversationHistory = this.state.get<LlmMessage[]>(this.getSessionLlmHistoryKey(targetSessionId), []);
                    this.alwaysAcceptSuggestions = new Set();
                    this.isAcceptAlwaysActive = false;
                    await this.handleSessionChange();
                    this.developerLogService.log(`[OrchestratorAgent] Switched active session to ${targetSessionId} per correlation.`);
                }
            } catch {}

            let blockedByConfirmation = false; // do not advance/finish plan until user accepts/declines

            switch (message.type) {
                case 'status-update': {
                    // SDK standard: status-update from eventBus.publish({ kind: 'status-update', ... })
                    const statusState = message.payload?.state || 'working';
                    const statusMessage = message.payload?.message || '';
                    const isFinal = message.payload?.final || false;
                    const sender = message.sender || 'Unknown';

                    if (statusMessage) {
                        if (statusState === 'streaming-chunk') {
                            // console.log(`[OrchestratorAgent] Received streaming chunk: ${statusMessage.length} chars`);
                            this.processProgressLogChunk(statusMessage, sender);
                        } else {
                            // status-update는 항상 progress log로 표시 (bubble 아님)
                            this.processProgressLog(statusMessage, sender);
                        }

                        // final 상태이고 completed면 plan step 업데이트
                        if (isFinal && statusState === 'completed') {
                            const currentStepIndex = this.currentPlan.findIndex(step => step.status === 'in-progress');
                            if (currentStepIndex !== -1) {
                                this.currentPlan[currentStepIndex].status = 'completed';
                                this._onDidPostMessage.fire({
                                    command: 'updatePlanStep',
                                    payload: { index: currentStepIndex, status: 'completed' }
                                });
                            }
                        } else if (isFinal && statusState === 'failed') {
                            const currentStepIndex = this.currentPlan.findIndex(step => step.status === 'in-progress');
                            if (currentStepIndex !== -1) {
                                this.currentPlan[currentStepIndex].status = 'error';
                                this._onDidPostMessage.fire({
                                    command: 'updatePlanStep',
                                    payload: { index: currentStepIndex, status: 'error' }
                                });
                            }
                        }
                    }
                    break;
                }

                // Legacy 'log' type removed - use 'status-update' (SDK standard) instead

                case 'propose-task': {
                    // Handle TASK.md content display (SDK compliant)
                    const tasks: string[] = Array.isArray(message.payload?.tasks) ? message.payload.tasks : [];
                    const filePath: string = message.payload?.filePath || 'TASK.md';

                    if (tasks && tasks.length > 0) {
                        // Record that we've sent a structured message from this sender
                        const sender = message.sender || 'TaskDecompositionAgent';
                        const key = `propose-task:${sender}`;
                        this.recentStructuredMessages.set(key, { timestamp: Date.now(), sender });

                        // Display tasks in UI as TASK bubble
                        const taskList = tasks.map((task, i) => {
                            const trimmed = (task || '').trim();
                            const hasLeadingBullet = /^\s*(?:\d+\.\s+|[-*•]\s+)/.test(trimmed);
                            return hasLeadingBullet ? trimmed : `${i + 1}. ${trimmed}`;
                        }).join('\n');
                        const taskMessage = `**TASK List** (from ${filePath}):\n\n${taskList}`;
                        const senderName = sender;

                        const chatMsg: ChatMessage = {
                            author: 'agent',
                            content: [{ type: 'text', text: taskMessage }],
                            senderName,
                            timestamp: new Date().toISOString(),
                            kind: 'task' as any
                        };
                        await this.addMessageToHistory(chatMsg);
                        this._onDidPostMessage.fire({
                            command: 'response',
                            payload: {
                                text: taskMessage,
                                senderName: chatMsg.senderName,
                                timestamp: chatMsg.timestamp,
                                kind: 'task'  // ← TASK bubble로 표시
                            }
                        });

                        // Also log completion
                        this._onDidPostMessage.fire({
                            command: 'progressLog',
                            payload: { text: `TASK List created with ${tasks.length} items` }
                        });
                    }

                    // Mark current step as completed and advance to next step
                    const currentStepIndex = this.currentPlan.findIndex(step => step.status === 'in-progress');
                    if (currentStepIndex !== -1) {
                        this.currentPlan[currentStepIndex].status = 'completed';
                        this._onDidPostMessage.fire({
                            command: 'updatePlanStep',
                            payload: { index: currentStepIndex, status: 'completed' }
                        });
                    }

                    // Advance to next step if available
                    const pendingIdx = this.currentPlan.findIndex(step => step.status === 'pending');
                    const hasInProgress = this.currentPlan.some(step => step.status === 'in-progress');
                    if (!hasInProgress && pendingIdx !== -1) {
                        await this.executePlan();
                    }
                    break;
                }

                case 'propose-plan': {
                    // Clear sticky routing on plan proposal (Brainstorm finalized)
                    this.stickyAgentName = '';
                    this.stickyExpiresAt = 0;
                    this.brainstormContextId = '';
                    const steps: string[] = Array.isArray(message.payload?.steps) ? message.payload.steps : [];
                    const plan: string = message.payload?.plan || '';  // 추상적 시스템 설계 문서
                    const filePath: string = message.payload?.filePath || 'PLAN.md';
                    const finalized: boolean = !!message.payload?.finalized;
                    try { console.log(`[OrchestratorAgent] propose-plan received: steps=${steps.length} plan=${plan ? 'yes' : 'no'} finalized=${finalized}`); } catch {}

                    // Record that we've sent a structured message from this sender
                    const sender = message.sender || 'BrainstormAgent';
                    const key = `propose-plan:${sender}`;
                    this.recentStructuredMessages.set(key, { timestamp: Date.now(), sender });

                    // Display PLAN document in UI if provided
                    if (plan && plan.length > 0) {
                        const senderName = message.sender || 'BrainstormAgent';
                        const planMessage: ChatMessage = {
                            author: 'agent',
                            content: [{ type: 'text', text: `**System Design** (from ${filePath}):\n\n${plan}` }],
                            senderName,
                            timestamp: new Date().toISOString(),
                            kind: 'plan' as any
                        };
                        await this.addMessageToHistory(planMessage);
                        this._onDidPostMessage.fire({
                            command: 'response',
                            payload: {
                                text: `**System Design** (from ${filePath}):\n\n${plan}`,
                                senderName: planMessage.senderName,
                                timestamp: planMessage.timestamp,
                                kind: 'plan'
                            }
                        });
                    }

                    // Build execution plan from proposed steps
                    if (steps && steps.length > 0) {
                        this.planId = uuidv4();
                        const deferRegex = /(documentationgenerationagent|readmegenerationagent|testgenerationagent)\s*:/i;
                        const main = steps.filter(s => typeof s === 'string' && !deferRegex.test(String(s)));
                        const deferred = steps.filter(s => typeof s === 'string' && deferRegex.test(String(s)));
                        this.deferredPostActions = deferred;
                        this.pendingPostActions = [];
                        this.isAwaitingPostActionsConfirmation = false;
                        this.suppressPostActionsSuggestions = false;
                        this.producedArtifacts.clear();
                        this.currentPlan = main.map((desc: string, i: number) => ({ id: `${this.planId}:${i + 1}`, description: desc, status: 'pending' }));
                        this.currentStepIndex = -1;
                        this.currentExecutionId = '';
                        this.handledExecutions.clear();
                        // Show plan after brainstorming
                        try { this._onDidPostMessage.fire({ command: 'displayPlan', payload: { plan: this.currentPlan } }); } catch {}
                        try { console.log(`[OrchestratorAgent] displayPlan -> ${this.currentPlan.length} steps`); } catch {}
                        // Uroboros 모드라도 finalized면 바로 진행
                        if (!this.autonomousMode || finalized) {
                            try { console.log('[OrchestratorAgent] Auto-executing proposed plan'); } catch {}
                            await this.executePlan();
                        } else {
                            // Ask for approval in Uroboros mode (non-finalized)
                            const planDetails = this.currentPlan.map((step, index) => `${index + 1}. ${step.description}`).join('\n');
                            const fullResponseMessage = `I have created the following plan. Please review it and confirm to proceed:\n${planDetails}`;
                            const planCreatedMessage: ChatMessage = { author: 'agent', content: [{ type: 'text', text: fullResponseMessage }], senderName: OrchestratorAgent.AGENT_ID, timestamp: new Date().toISOString() };
                            await this.addMessageToHistory(planCreatedMessage);
                            this._onDidPostMessage.fire({ command: 'response', payload: { text: fullResponseMessage, senderName: planCreatedMessage.senderName, timestamp: planCreatedMessage.timestamp }});
                            this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: 'I have created a plan. Shall I proceed? Please reply with yes/ok to continue.' } });
                            this.pendingPlan = this.currentPlan.map(step => ({ ...step }));
                            this.isAwaitingPlanConfirmation = true;
                            await this.requestPlanConfirmation();
                        }
                    } else {
                        // No steps proposed; mark brainstorm step completed if any and continue
                        const idx = this.currentPlan.findIndex(step => step.status === 'in-progress');
                        if (idx !== -1) {
                            this.currentPlan[idx].status = 'completed' as any;
                            this._onDidPostMessage.fire({ command: 'updatePlanStep', payload: { index: idx, status: 'completed' } });

                            // Update TASK.md via TaskDecompositionAgent
                            await this.updateTaskMd(idx, this.currentPlan[idx].description);
                        }
                        try { console.log('[OrchestratorAgent] No steps in propose-plan; continuing executePlan'); } catch {}
                        await this.executePlan();
                    }
                    break;
                }

                case 'request-clarification': {
                    // Handle Reverse Query (Agent -> User)
                    const question = message.payload?.question || '';
                    const context = message.payload?.context || '';
                    const options = message.payload?.options || [];
                    const sender = message.sender || 'Unknown Agent';

                    if (question) {
                        this.developerLogService.log(`[OrchestratorAgent] Clarification requested by ${sender}: ${question}`);

                        // 1. Display the question to the user
                        const chatMsg: ChatMessage = {
                            author: 'agent',
                            content: [{ type: 'text', text: `**${sender} asks:** ${question}\n\n${context ? `*Context: ${context}*` : ''}${options.length > 0 ? `\n\nOptions:\n${options.map((o: string, i: number) => `${i + 1}. ${o}`).join('\n')}` : ''}` }],
                            senderName: sender,
                            timestamp: new Date().toISOString(),
                            kind: 'text' // Standard text bubble for questions
                        };
                        await this.addMessageToHistory(chatMsg);
                        this._onDidPostMessage.fire({
                            command: 'response',
                            payload: {
                                text: chatMsg.content[0].text,
                                senderName: chatMsg.senderName,
                                timestamp: chatMsg.timestamp
                            }
                        });

                        // 2. Set sticky routing so user's reply goes back to this agent
                        this.stickyAgentName = sender;
                        this.stickyExpiresAt = Date.now() + (1000 * 60 * 5); // 5 minutes expiry
                        this.brainstormContextId = message.contextId || ''; // Preserve context if available

                        // 3. Pause the plan (or keep it in-progress but blocked)
                        // We don't mark the step as completed. We just wait for user input.
                        // The user's reply will trigger `handleUserMessage`, which should respect `stickyAgentName`.
                        
                        this._onDidPostMessage.fire({ command: 'progressLog', payload: { text: `Waiting for user clarification for ${sender}...` } });
                    }
                    break;
                }
                case 'response': {
                    const text = message.payload?.text || message.payload?.content || 'Task completed.';
                    const sender = message.sender || 'Agent';

                    const chatMsg: ChatMessage = {
                        author: 'agent',
                        content: [{ type: 'text', text }],
                        senderName: sender,
                        timestamp: new Date().toISOString()
                    };
                    await this.addMessageToHistory(chatMsg);
                    this._onDidPostMessage.fire({
                        command: 'response',
                        payload: {
                            text: chatMsg.content[0].text,
                            senderName: chatMsg.senderName,
                            timestamp: chatMsg.timestamp
                        }
                    });

                    const currentStepIndex = this.currentPlan.findIndex(step => step.status === 'in-progress');
                    if (currentStepIndex !== -1) {
                        this.currentPlan[currentStepIndex].status = 'completed';
                        this._onDidPostMessage.fire({ command: 'updatePlanStep', payload: { index: currentStepIndex, status: 'completed' } });
                        this.developerLogService.log(`[OrchestratorAgent] Step ${currentStepIndex + 1} completed (generic response from ${sender}).`);
                        await this.updateTaskMd(currentStepIndex, this.currentPlan[currentStepIndex].description);
                        await this.executePlan();
                    }
                    break;
                }

                case 'response-code-execution': {
                    const { filePath, content, success, error, needsConfirmation, suggestionType, correlation, originalContent } = message.payload;
                    // Correlation validation for idempotency (accept aliases: workflowId/runId)
                    // SDK Standard: Plan이 없는 경우에도 correlation 검증 (stepId는 빈 문자열 허용)
                    const expectedStepId = (this.currentStepIndex >= 0 && this.currentStepIndex < this.currentPlan.length) ? this.currentPlan[this.currentStepIndex].id : '';
                    const cidPlan = correlation?.planId || correlation?.workflowId;
                    const cidExec = correlation?.executionId || correlation?.runId;
                    this.developerLogService.log(`[OrchestratorAgent] Correlation check: expected planId=${this.planId} stepId=${expectedStepId} execId=${this.currentExecutionId}; received planId=${cidPlan} stepId=${correlation?.stepId} execId=${cidExec} from=${message.sender}`);
                    // Plan이 없는 경우: planId와 executionId만 검증, stepId는 빈 문자열 허용
                    const hasPlan = this.currentPlan.length > 0;
                    const isValid = !!correlation &&
                        cidPlan === this.planId &&
                        cidExec === this.currentExecutionId &&
                        (hasPlan ? correlation.stepId === expectedStepId : (correlation.stepId === expectedStepId || correlation.stepId === '' || !correlation.stepId));
                    if (!isValid) {
                        this.developerLogService.log(`[OrchestratorAgent] Ignoring A2A response with mismatched correlation. expected(planId=${this.planId}, stepId=${expectedStepId}, execId=${this.currentExecutionId}) received(planId=${cidPlan}, stepId=${correlation?.stepId}, execId=${cidExec}) sender=${message.sender}`);
                        return;
                    }
                    if (this.handledExecutions.has(cidExec)) {
                        this.developerLogService.log(`[OrchestratorAgent] Duplicate A2A response ignored for executionId=${cidExec}.`);
                        return;
                    }
                    this.handledExecutions.add(cidExec);

                    // Error Handling & Auto-Retry
                    if (!success || message.payload.status === 'error') {
                        const errorMsg = error || message.payload.errorMessage || 'Unknown error';
                        this.developerLogService.log(`[OrchestratorAgent] Agent execution failed: ${errorMsg}. Attempting auto-retry via LLM.`);
                        
                        // Add error to history so LLM knows context, but DO NOT show as chat bubble (User Preference)
                        // Instead, just log it to progress log
                        this._onDidPostMessage.fire({ command: 'progressLog', payload: { text: `Agent execution failed: ${errorMsg}. Attempting to fix...` } });
                        
                        // Still add to LLM history silently for context
                        this.llmConversationHistory.push({ role: 'assistant', content: `Agent execution failed: ${errorMsg}` });
                        this.pruneLlmHistoryIfNeeded();

                        // Ask LLM for a fix
                        const currentStep = this.currentPlan[this.currentStepIndex];
                        const originalTask = currentStep ? currentStep.description : 'Unknown task';
                        
                        const retryPrompt = `System: You are Viper, an expert coding partner.
The previous agent execution (${message.sender}) failed with the following error: "${errorMsg}".

Original Task: "${originalTask}"

Please analyze the error and provide a corrected instruction or payload to retry the task.
If the error was "No filePath provided", please infer the file path from context or ask the user.
Return ONLY the corrected instruction text to be routed to the agent.`;

                        try {
                            const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
                            const apiKeys = await this.configService.getApiKeys();
                            const endpoint = this.configService.getEndpoint();
                            const provider = this.configService.getLlmProvider();

                            const lang = (vscode.env.language || 'en').toLowerCase();
                            const sys = `Speak only in ${lang}.`;

                            const retryResponse = await this.llmService.requestLLMCompletion(
                                provider,
                                [{ role: 'system', content: sys }, { role: 'user', content: retryPrompt }],
                                apiKeys[0] || '',
                                endpoint,
                                [],
                                model,
                                undefined,
                                60000
                            );

                            const fixText = (retryResponse.choices?.[0]?.message?.content || '').trim();
                            if (fixText) {
                                await this.routeAndDelegate(fixText);
                            } else {
                                this.developerLogService.log(`[OrchestratorAgent] Failed to generate auto-retry fix.`);
                            }
                        } catch (e: any) {
                            this.developerLogService.log(`[OrchestratorAgent] Auto-retry failed: ${e?.message || e}`);
                        }
                        return;
                    }

                    this.developerLogService.log(`[OrchestratorAgent] Accepted A2A response for executionId=${cidExec}, stepId=${expectedStepId}, sender=${message.sender}`);
                    let responseText: string | undefined = undefined;

                    // 파일은 무조건 먼저 생성/수정하고, Create New File 카드와 diff list에 표시
                    const isCommand = (suggestionType === 'command-execution');

                    if (!isCommand && filePath && content) {
                        // 1. Checkpoint: Create snapshot before file modification (if enabled)
                        if (this.configService.getCheckpointsEnabled()) {
                            try {
                                const folders = vscode.workspace.workspaceFolders;
                                if (folders && folders.length > 0) {
                                    const root = folders[0].uri.fsPath;
                                    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
                                    const checkpointDir = path.join(root, '.viper', 'checkpoints', `${stamp}-before-${path.basename(filePath)}`);
                                    await fs.mkdir(checkpointDir, { recursive: true });
                                    const exclude = new Set(['.git', '.viper', 'node_modules']);
                                    const copyRecursive = async (src: string, dst: string) => {
                                        const entries = await fs.readdir(src, { withFileTypes: true });
                                        for (const ent of entries) {
                                            if (exclude.has(ent.name)) { continue; }
                                            const s = path.join(src, ent.name);
                                            const d = path.join(dst, ent.name);
                                            if (ent.isDirectory()) {
                                                await fs.mkdir(d, { recursive: true });
                                                await copyRecursive(s, d);
                                            } else if (ent.isFile()) {
                                                const data = await fs.readFile(s);
                                                await fs.writeFile(d, data);
                                            }
                                        }
                                    };
                                    await copyRecursive(root, checkpointDir);
                                    this.developerLogService.log(`[OrchestratorAgent] Checkpoint created: ${checkpointDir}`);
                                    this._onDidPostMessage.fire({
                                        command: 'progressLog',
                                        payload: { text: `Checkpoint created: ${path.basename(filePath)}` }
                                    });
                                }
                            } catch (e: any) {
                                this.developerLogService.log(`[OrchestratorAgent] Checkpoint creation failed: ${e?.message || e}`);
                                this._onDidPostMessage.fire({
                                    command: 'progressLog',
                                    payload: { text: `Checkpoint creation failed: ${e?.message || 'Unknown error'}` }
                                });
                            }
                        }

                        // Check existence BEFORE writing to determine action correctly
                        let fileExists = false;
                        try {
                            await fs.access(filePath);
                            fileExists = true;
                        } catch {}

                        // 2. 파일 먼저 작성
                        const mcpClient = getMcpClient();
                        const dir = path.dirname(filePath);
                        try { await fs.mkdir(dir, { recursive: true }); } catch {}
                        
                        try {
                            // Add timeout to MCP call to prevent hangs
                            const timeoutMs = 5000; // 5 seconds timeout
                            await Promise.race([
                                mcpClient.callTool({ name: 'FileWriteTool', arguments: { filePath, content } } as any),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('FileWriteTool timed out')), timeoutMs))
                            ]);
                        } catch (e: any) {
                            this.developerLogService.log(`[OrchestratorAgent] FileWriteTool failed or timed out: ${e?.message}. Falling back to fs.writeFile.`);
                            try {
                                await fs.writeFile(filePath, content);
                            } catch (fsError: any) {
                                this.developerLogService.log(`[OrchestratorAgent] fs.writeFile failed: ${fsError?.message}`);
                                throw fsError; // Re-throw if both fail
                            }
                        }
                        console.log(`[OrchestratorAgent] File created/updated: ${filePath}`);

                        // 3. Linter: Run linter and auto-fix errors (if enabled)
                        let lintSummary = '0 lint errors';
                        try {
                            const lintTimeoutMs = 15000; // 15 seconds timeout for linting
                            const lintResult = await Promise.race([
                                mcpClient.callTool({
                                    name: 'LintTool',
                                    arguments: { paths: [filePath], fix: true }
                                } as any),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('LintTool timed out')), lintTimeoutMs))
                            ]);

                            if (lintResult) {
                                const errorCount = (lintResult as any).errorCount || 0;
                                const warningCount = (lintResult as any).warningCount || 0;

                                if (errorCount > 0 || warningCount > 0) {
                                    lintSummary = `${errorCount} error${errorCount !== 1 ? 's' : ''}, ${warningCount} warning${warningCount !== 1 ? 's' : ''}`;
                                    this.developerLogService.log(`[OrchestratorAgent] Linter found ${errorCount} error(s), ${warningCount} warning(s) in ${filePath}`);
                                    this._onDidPostMessage.fire({
                                        command: 'progressLog',
                                        payload: { text: `Linter: ${lintSummary} in ${path.basename(filePath)}` }
                                    });

                                    // If auto-fix was applied, re-read the file to get fixed content
                                    if ((lintResult as any).output && errorCount === 0) {
                                        // Auto-fix succeeded, update lint summary
                                        lintSummary = '0 lint errors (auto-fixed)';
                                        const fixedContent = await fs.readFile(filePath, 'utf-8');
                                        // Update the diff view with fixed content if needed
                                        this._onDidPostMessage.fire({
                                            command: 'updateFileCard',
                                            payload: { filePath, content: fixedContent, lintSummary }
                                        });
                                    }
                                } else {
                                    lintSummary = '0 lint errors';
                                }
                            }
                        } catch (e: any) {
                            // Linter failure is non-critical
                            this.developerLogService.log(`[OrchestratorAgent] Linter check failed (non-critical): ${e?.message || e}`);
                            lintSummary = 'Linter unavailable';
                        }

                        // artifact 기록
                        const action = fileExists ? 'updated' : 'created';
                        try { this.recordArtifact(filePath, action); } catch {}

                        // progress log 표시 (bubble 없이만)
                        const okText = `[${message.sender}] ${fileExists ? 'Updating' : 'Creating'} file: ${path.basename(filePath)}...`;
                        this._onDidPostMessage.fire({ command: 'progressLog', payload: { text: okText } });

                        // 파일이 생성되었으므로 createFileCard 표시
                        const timestamp = new Date().toISOString();
                        const inferredType = suggestionType || (fileExists ? 'edit-file' : 'create-file');
                        
                        // Calculate relative path for display
                        const ws = vscode.workspace.workspaceFolders;
                        const root = ws?.[0]?.uri?.fsPath || '';
                        const relativePath = root ? path.relative(root, filePath) : path.basename(filePath);
                        
                        const title = fileExists ? `Update File: ${relativePath}` : `Create New File: ${relativePath}`;

                        this._onDidPostMessage.fire({
                            command: 'createFileCard',
                            payload: {
                                filePath,
                                relativePath,
                                title,
                                suggestionType: inferredType,
                                senderName: message.sender,
                                timestamp,
                                lintSummary,
                                description: fileExists ? 'File updated' : 'File created'
                            }
                        });

                        // DO NOT call addMessageToHistory immediately - it may trigger loadHistory and clear the UI
                        // Instead, delay it to ensure createFileCard is rendered first
                        setTimeout(async () => {
                            try {
                                const fileCardMessage: ChatMessage = {
                                    author: 'agent',
                                    content: [{ type: 'text', text: '' }],
                                    senderName: message.sender,
                                    timestamp,
                                    kind: 'codeEditFile',
                                    filePath,
                                    title,
                                    suggestionType: inferredType,
                                    lintSummary
                                } as any;
                                await this.addMessageToHistory(fileCardMessage);
                            } catch (err) {
                                console.warn('[OrchestratorAgent] Failed to record createFileCard history entry', err);
                            }
                        }, 1000); // Delay to ensure createFileCard is rendered first
                    }

                    // SDK Standard: 파일 생성은 needsConfirmation과 무관하게 항상 즉시 생성됨
                    // 파일 생성 후 즉시 step 완료 처리 (plan이 있는 경우)
                    if (success && !isCommand && filePath && content) {
                        // File already created above, now mark step as completed if plan exists
                        const currentStepIndex = this.currentPlan.findIndex(step => step.status === 'in-progress');
                        if (currentStepIndex !== -1) {
                            // Plan이 있고 현재 step이 in-progress인 경우
                            this.currentPlan[currentStepIndex].status = 'completed';
                            this._onDidPostMessage.fire({
                                command: 'updatePlanStep',
                                payload: { index: currentStepIndex, status: 'completed' }
                            });
                            this.developerLogService.log(`[OrchestratorAgent] Step ${currentStepIndex + 1} completed (file created).`);

                            // Update TASK.md via TaskDecompositionAgent
                            await this.updateTaskMd(currentStepIndex, this.currentPlan[currentStepIndex].description);

                            // Advance plan immediately after step completion
                            // Advance plan immediately after step completion
                            // Always delegate to executePlan to handle next step or completion summary
                            await this.executePlan();

                        } else {
                            // Plan이 없거나 현재 step이 in-progress가 아닌 경우 (direct dispatch)
                            // SDK Standard: Plan이 없는 경우 항상 요약 생성
                            if (this.currentPlan.length === 0 && filePath) {
                                this.developerLogService.log(`[OrchestratorAgent] File created successfully (no plan). Generating summary.`);
                                await this.sendDirectActionSummary(filePath || '', message.sender || 'unknown');
                            } else if (currentStepIndex === -1 && this.currentPlan.length > 0) {
                                // Plan이 있지만 현재 step이 in-progress가 아닌 경우 (이상 상황)
                                this.developerLogService.log(`[OrchestratorAgent] Warning: File created but no in-progress step found. Plan length: ${this.currentPlan.length}`);
                            }
                        }
                    }

                    // Command는 needsConfirmation과 무관하게 diff만 표시 (파일 생성 아님)
                    if (isCommand && needsConfirmation) {
                        const originalCode = '';
                        const modifiedCode = content || '';
                        const patch = diff.createPatch('run:command', originalCode, modifiedCode);
                        let diffHtml = '<pre><code>';
                        patch.split('\n').forEach(line => {
                            if (line.startsWith('+')) { diffHtml += `<span style="color: green;">${line}</span>\n`; }
                            else if (line.startsWith('-')) { diffHtml += `<span style="color: red;">${line}</span>\n`; }
                            else { diffHtml += `${line}\n`; }
                        });
                        diffHtml += '</code></pre>';
                        const confirmationMessage: ChatMessage = {
                            author: 'agent',
                            content: [{ type: 'diff', diffHtml, originalCode, modifiedCode, title: 'Run Command', filePath: 'run:command', suggestionType: 'command-execution' }],
                            senderName: message.sender,
                            timestamp: new Date().toISOString()
                        };
                        await this.addMessageToHistory(confirmationMessage);
                        this._onDidPostMessage.fire({
                            command: 'displayDiffInChatBubble',
                            payload: { diffHtml, originalCode, modifiedCode, title: 'Run Command', filePath: 'run:command', suggestionType: 'command-execution', senderName: message.sender, timestamp: confirmationMessage.timestamp }
                        });
                    }

                    // 파일 생성은 이미 완료되었으므로 diff list에만 추가 (chat bubble에는 diff 표시 안 함)
                    if (!isCommand && filePath && content) {
                        // 파일은 이미 생성되었으므로 diff 정보만 계산하여 diff list에 추가
                        let originalCode = '';
                        let diffTargetExists = false;
                        try {
                            originalCode = await fs.readFile(filePath, 'utf-8');
                            diffTargetExists = true;
                        } catch {}
                        const modifiedCode = content || '';

                        // jsdiff의 diffLines를 사용하여 정확한 라인 수 계산
                        const changes = diff.diffLines(originalCode, modifiedCode);
                        let addedLines = 0;
                        let removedLines = 0;

                        changes.forEach(change => {
                            if (change.added) {
                                const lines = change.value.split('\n').filter(line => line.length > 0 || change.value.endsWith('\n'));
                                addedLines += lines.length;
                            } else if (change.removed) {
                                const lines = change.value.split('\n').filter(line => line.length > 0 || change.value.endsWith('\n'));
                                removedLines += lines.length;
                            }
                        });

                        // new file인 경우 모든 라인을 추가로 계산
                        if (!diffTargetExists && modifiedCode) {
                            const lines = modifiedCode.split('\n');
                            // 마지막 빈 줄 제외
                            const nonEmptyLines = lines.filter((line: string, idx: number) => idx < lines.length - 1 || line.trim().length > 0);
                            addedLines = nonEmptyLines.length > 0 ? nonEmptyLines.length : (lines.length > 0 ? 1 : 0);
                        }

                        // diff HTML 생성 (patch 형식)
                        const patch = diff.createPatch(filePath, originalCode, modifiedCode);
                        let diffHtml = '<pre><code>';
                        const patchLines = patch.split('\n');
                        let inHunk = false;

                        patchLines.forEach(line => {
                            if (line.startsWith('@@')) {
                                inHunk = true;
                                diffHtml += `${line}\n`;
                                return;
                            }
                            if (!inHunk) {
                                if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff') || line.startsWith('index')) {
                                    return;
                                }
                            }
                            if (inHunk) {
                                if (line.startsWith('+') && !line.startsWith('+++')) {
                                    diffHtml += `<span style="color: green;">${line}</span>\n`;
                                }
                                else if (line.startsWith('-') && !line.startsWith('---')) {
                                    diffHtml += `<span style="color: red;">${line}</span>\n`;
                                }
                                else {
                                    diffHtml += `${line}\n`;
                                }
                            }
                        });

                        if (!diffTargetExists && diffHtml === '<pre><code>') {
                            modifiedCode.split('\n').forEach((line: string) => {
                                diffHtml += `<span style="color: green;">+${line}</span>\n`;
                            });
                        }
                        diffHtml += '</code></pre>';
                        const inferredType = suggestionType || (diffTargetExists ? 'edit-file' : 'create-file');
                        const title = diffTargetExists ? `Edit File: ${path.basename(filePath)}` : `Create New File: ${path.basename(filePath)}`;

                        // Diff list에만 추가 (chat bubble에는 표시 안 함)
                        this._onDidPostMessage.fire({
                            command: 'addDiff',
                            payload: {
                                filePath,
                                originalCode,
                                modifiedCode,
                                title,
                                suggestionType: inferredType,
                                diffHtml,
                                addedLines,
                                removedLines
                            }
                        });
                    }
                    break;
                }

                case 'response-context': {
                    const { response, correlation } = message.payload;
                    const sender = message.sender || 'Agent';

                    // Correlation validation
                    const expectedStepId = (this.currentStepIndex >= 0 && this.currentStepIndex < this.currentPlan.length) ? this.currentPlan[this.currentStepIndex].id : '';
                    const cidPlan = correlation?.planId || correlation?.workflowId;
                    const cidExec = correlation?.executionId || correlation?.runId;
                    
                    // Plan이 없는 경우: planId와 executionId만 검증, stepId는 빈 문자열 허용
                    const hasPlan = this.currentPlan.length > 0;
                    const isValid = !!correlation &&
                        cidPlan === this.planId &&
                        cidExec === this.currentExecutionId &&
                        (hasPlan ? correlation.stepId === expectedStepId : (correlation.stepId === expectedStepId || correlation.stepId === '' || !correlation.stepId));

                    if (!isValid) {
                        this.developerLogService.log(`[OrchestratorAgent] Ignoring response-context with mismatched correlation. expected(planId=${this.planId}, stepId=${expectedStepId}, execId=${this.currentExecutionId}) received(planId=${cidPlan}, stepId=${correlation?.stepId}, execId=${cidExec}) sender=${message.sender}`);
                        return;
                    }
                    if (this.handledExecutions.has(cidExec)) {
                        this.developerLogService.log(`[OrchestratorAgent] Duplicate response-context ignored for executionId=${cidExec}.`);
                        return;
                    }
                    this.handledExecutions.add(cidExec);

                    // Log the context response
                    const { userFacingText, thought } = this.parseThoughtAndUserFacingText(response);
                    // If thought exists, use it as the primary log message (it's usually a better summary than raw output)
                    // If no thought, fall back to userFacingText
                    const logContent = thought ? `Thinking: ${thought}` : userFacingText;
                    const logText = `✅ ${sender}: ${logContent}`;
                    
                    this.developerLogService.log(`[OrchestratorAgent] Received context from ${sender}: ${logText.slice(0, 100)}...`);
                    this._onDidPostMessage.fire({
                        command: 'progressLog',
                        payload: { text: logText.slice(0, 300) + (logText.length > 300 ? '...' : '') }
                    });

                    // Mark step as completed
                    const currentStepIndex = this.currentPlan.findIndex(step => step.status === 'in-progress');
                    if (currentStepIndex !== -1) {
                        this.currentPlan[currentStepIndex].status = 'completed';
                        this._onDidPostMessage.fire({
                            command: 'updatePlanStep',
                            payload: { index: currentStepIndex, status: 'completed' }
                        });
                        
                        // Update TASK.md
                        await this.updateTaskMd(currentStepIndex, this.currentPlan[currentStepIndex].description);

                        // Advance plan
                        const nextStepIndex = this.currentPlan.findIndex(step => step.status === 'pending');
                        if (nextStepIndex !== -1) {
                            await this.executePlan();
                        } else if (this.currentPlan.every(step => step.status === 'completed' || step.status === 'error')) {
                            const hasErrors = this.currentPlan.some(step => step.status === 'error');
                            this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: hasErrors ? 'Plan finished with errors.' : 'Plan finished.' } });
                            await this.sendPlanCompletionSummary(hasErrors);
                            await this.updateSessionTitleSummary?.();
                            this.currentPlan = [];
                            this.producedArtifacts.clear();
                        }
                    } else {
                         // Direct dispatch case (no plan) - just log
                         this.developerLogService.log(`[OrchestratorAgent] Context received (no active plan step).`);
                    }
                    break;
                }

                case 'response-clarification': {
                    // Handle clarification requests from agents
                    const question = message.payload?.question || 'The agent requested clarification.';
                    const options = message.payload?.options;
                    const context = message.payload?.context;
                    const sender = message.sender || 'Agent';

                    // Log the clarification request
                    this._onDidPostMessage.fire({
                        command: 'progressLog',
                        payload: { text: `❓ ${sender} is asking for clarification: ${question}` }
                    });

                    // Create a clarification message bubble
                    const clarificationMsg: ChatMessage = {
                        author: 'agent',
                        content: [{ type: 'text', text: `**${sender}** needs clarification:\n\n${question}${options ? '\n\nOptions:\n' + options.map((o: string) => `- ${o}`).join('\n') : ''}` }],
                        senderName: sender,
                        timestamp: new Date().toISOString()
                    } as any;
                    (clarificationMsg as any).requiresUserInput = true; // IMPORTANT: This stops the spinner and shows input box

                    await this.addMessageToHistory(clarificationMsg);
                    this._onDidPostMessage.fire({
                        command: 'response',
                        payload: {
                            text: clarificationMsg.content[0].text,
                            senderName: clarificationMsg.senderName,
                            timestamp: clarificationMsg.timestamp,
                            requiresUserInput: true // Explicitly signal UI to unlock input
                        }
                    });

                    // Pause plan execution until user responds
                    this.stickyAgentName = sender;
                    this.stickyExpiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
                    const currentStepIdx = this.currentPlan.findIndex(step => step.status === 'in-progress');
                    if (currentStepIdx !== -1) {
                        this.currentPlan[currentStepIdx].status = 'pending';
                        this._onDidPostMessage.fire({ command: 'updatePlanStep', payload: { index: currentStepIdx, status: 'pending' } });
                    }
                    blockedByConfirmation = true;
                    break;
                }



                case 'error': {
                    // Handle errors from agents (e.g., MCP tool failures)
                    const errorText = message.payload?.error || 'An error occurred during execution.';
                    const sender = message.sender || 'Agent';
                    const correlation = message.payload?.correlation;

                    // Track retry count for current step
                    if (this.currentStepIndex >= 0 && this.currentStepIndex < this.currentPlan.length) {
                        const currentStep = this.currentPlan[this.currentStepIndex];
                        const retryCount = (currentStep as any).retryCount || 0;
                        const maxRetries = 2; // Maximum 2 retries per step

                        if (retryCount < maxRetries) {
                            // Attempt to recover from error by asking LLM for a fix
                            try {
                                console.log(`[OrchestratorAgent] Attempting auto-recovery for step ${this.currentStepIndex + 1}, retry ${retryCount + 1}/${maxRetries}`);

                                // Show recovery attempt to user
                                this._onDidPostMessage.fire({
                                    command: 'progressLog',
                                    payload: { text: `🔄 Attempting to recover from error (retry ${retryCount + 1}/${maxRetries})...` }
                                });

                                // Check for timeout errors
                                if (errorText.toLowerCase().includes('timed out') || errorText.toLowerCase().includes('timeout')) {
                                    console.log(`[OrchestratorAgent] Timeout detected. Retrying original step without LLM modification.`);
                                    this._onDidPostMessage.fire({
                                        command: 'progressLog',
                                        payload: { text: `🔄 Timeout detected. Retrying original step (retry ${retryCount + 1}/${maxRetries})...` }
                                    });
                                    
                                    // Retry with original step description
                                    currentStep.retryCount = (retryCount + 1);
                                    // Re-execute plan (which will pick up the in-progress step)
                                    await this.executePlan();
                                    break;
                                }

                                // Ask LLM to analyze the error and suggest a fix
                                const recoveryPrompt = `An error occurred while executing the following step:

**Original User Request:** ${this.lastUserQuery || 'N/A'}
**Step:** ${currentStep.description}
**Error:** ${errorText}

**Task:** Analyze the error and provide a corrected version of the step that will avoid this error.
- If the error indicates the task is already done or redundant, return "SKIP".
- If the error is about file paths, suggest using workspace-relative paths (e.g. "src/file.ts" instead of "d:/...").
- If the error is about permissions, suggest alternative approaches.
- Keep the corrected step concise and actionable.

**CRITICAL:** Output ONLY the corrected step description (or "SKIP") as a single line of text. Do NOT include any conversational text, explanations, or markdown formatting.`;

                                const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
                                const apiKeys = await this.configService.getApiKeys();
                                const apiKey = apiKeys[0] || '';
                                const endpoint = this.configService.getEndpoint();
                                const provider = this.configService.getLlmProvider();

                                const lang = (vscode.env.language || 'en').toLowerCase();
                                const sys = `Speak only in ${lang}.`;

                                const recoveryResponse = await this.llmService.requestLLMCompletion(
                                    provider,
                                    [{ role: 'system', content: sys }, { role: 'user', content: recoveryPrompt }],
                                    apiKey,
                                    endpoint,
                                    [],
                                    model,
                                    undefined,
                                    15000 // 15 second timeout
                                );

                                const correctedStep = typeof recoveryResponse.choices[0]?.message?.content === 'string' 
                                    ? recoveryResponse.choices[0]?.message?.content?.trim() 
                                    : '';

                                if (correctedStep && correctedStep.length > 1) {
                                    if (correctedStep === 'SKIP') {
                                        // Mark as completed (skipped)
                                        currentStep.status = 'completed';
                                        this._onDidPostMessage.fire({
                                            command: 'updatePlanStep',
                                            payload: { index: this.currentStepIndex, status: 'completed' }
                                        });
                                        this._onDidPostMessage.fire({
                                            command: 'progressLog',
                                            payload: { text: `⚠️ Skipped redundant step: ${currentStep.description}` }
                                        });
                                        // Advance to next step
                                        const nextStepIndex = this.currentPlan.findIndex(step => step.status === 'pending');
                                        if (nextStepIndex !== -1) {
                                            await this.executePlan();
                                        } else {
                                            // Plan finished
                                            this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: 'Plan finished (with skipped steps).' } });
                                            await this.sendPlanCompletionSummary(false);
                                            await this.updateSessionTitleSummary?.();
                                            this.currentPlan = [];
                                            this.producedArtifacts.clear();
                                        }
                                        break;
                                    }

                                    // Update step description with corrected version
                                    currentStep.description = correctedStep;
                                    currentStep.status = 'pending' as any;
                                    (currentStep as any).retryCount = retryCount + 1;

                                    // Reset currentStepIndex to retry this step
                                    this.currentStepIndex--;

                                    this._onDidPostMessage.fire({
                                        command: 'updatePlanStep',
                                        payload: { index: this.currentStepIndex + 1, status: 'pending', description: correctedStep }
                                    });

                                    this._onDidPostMessage.fire({
                                        command: 'progressLog',
                                        payload: { text: `✅ Recovery plan: ${correctedStep}` }
                                    });

                                    console.log(`[OrchestratorAgent] Recovery step generated:`, correctedStep);
                                    break; // Exit error case, will retry via executePlan
                                }
                            } catch (recoveryError: any) {
                                console.error('[OrchestratorAgent] Auto-recovery failed:', recoveryError?.message || recoveryError);
                            }
                        }

                        // If recovery failed or max retries reached, mark as error
                        currentStep.status = 'error' as any;
                        this._onDidPostMessage.fire({
                            command: 'updatePlanStep',
                            payload: { index: this.currentStepIndex, status: 'error' }
                        });
                    }

                    // Show error to user (only if not already shown by agent)
                    // Agent가 이미 error를 publish했으므로 여기서는 progress log만 표시
                    this._onDidPostMessage.fire({
                        command: 'progressLog',
                        payload: { text: `❌ Error from ${sender}: ${errorText}` }
                    });

                    // Skip adding to history and response - agent already published error
                    // const errorMessage: ChatMessage = {
                    //     author: 'agent',
                    //     content: [{ type: 'text', text: `❌ **Error from ${sender}:**\n\n${errorText}\n\n*Max retries reached. Continuing with next step.*` }],
                    //     senderName: sender,
                    //     timestamp: new Date().toISOString()
                    // } as any;
                    // await this.addMessageToHistory(errorMessage);
                    // await this.saveCurrentChatHistory();

                    // this._onDidPostMessage.fire({
                    //     command: 'response',
                    //     payload: {
                    //         text: errorMessage.content[0].text,
                    //         senderName: errorMessage.senderName,
                    //         timestamp: errorMessage.timestamp
                    //     }
                    // });
                    break; // Skip duplicate error display

                    console.error(`[OrchestratorAgent] Error from ${sender} (max retries reached):`, errorText);
                    break;
                }



                default:
                    this.developerLogService.log(`[OrchestratorAgent] Unhandled A2A message type: ${message.type}`);
                    break;
            }

            // After handling the response, only advance when no step is currently in-progress
            // This check runs after ALL message types (response-code-execution, response-context, etc.)
            const pendingIdx = this.currentPlan.findIndex(step => step.status === 'pending');
            const hasInProgress = this.currentPlan.some(step => step.status === 'in-progress');
            const completedCount = this.currentPlan.filter(step => step.status === 'completed' || step.status === 'error').length;

            if (!blockedByConfirmation && this.currentPlan.length > 0) {
                if (!hasInProgress && pendingIdx !== -1) {
                    // There are pending steps, execute next one
                    await this.executePlan();
                } else if (!hasInProgress && pendingIdx === -1 && completedCount === this.currentPlan.length) {
                    // Plan complete: all steps are done (completed or error), no pending or in-progress
                    if (!this.isSendingPlanSummary) {
                        this.isSendingPlanSummary = true;
                        const hasErrors = this.currentPlan.some(step => step.status === 'error');
                        const statusText = hasErrors ? 'Plan finished with errors.' : 'Plan finished.';
                        this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: statusText } });
                        await this.sendPlanCompletionSummary(hasErrors);
                        this.currentPlan = []; // Clear the completed plan
                        this.producedArtifacts.clear();
                        // Reset confirmation flags so future queries don't get treated as confirmations
                        this.isAwaitingPlanConfirmation = false;
                        this.pendingPlan = null;
                        this.isSendingPlanSummary = false;
                    }
                }
            }

        } catch (error: any) {
            console.error('[OrchestratorAgent] Error handling A2A message:', error);
            this.developerLogService.log(`ERROR: Failed to handle A2A message from ${message.sender}. ${error.message}`);

            // Mark current step as error if there is one
            const currentStepIndex = this.currentPlan.findIndex(step => step.status === 'in-progress');
            if (currentStepIndex !== -1) {
                this.currentPlan[currentStepIndex].status = 'error';
                this._onDidPostMessage.fire({ command: 'updatePlanStep', payload: { index: currentStepIndex, status: 'error' } });
            }

            // Try to continue with next step or finish plan
            const nextStepIndex = this.currentPlan.findIndex(step => step.status === 'pending');
            if (nextStepIndex !== -1) {
                this.developerLogService.log(`Continuing to next step after A2A message error.`);
                await this.executePlan();
            } else if (this.currentPlan.length > 0) {
                // No more steps, finish plan
                const hasErrors = this.currentPlan.some(step => step.status === 'error');
                const statusText = hasErrors ? 'Plan finished with errors.' : 'Plan finished.';
                this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: statusText } });
                this.parseAndSendFinalResponse(hasErrors ? 'Plan completed with some errors. Please review the steps.' : 'All steps completed successfully.');
                this.currentPlan = [];
            }
        }
    }

    private async handlePostActionsConfirmation(userText: string): Promise<boolean> {
        try {
            if (!this.isAwaitingPostActionsConfirmation || !Array.isArray(this.pendingPostActions) || this.pendingPostActions.length === 0) {
                return false;
            }

            const followUps = this.pendingPostActions.slice();
            const trimmed = (userText ?? '').trim();
            if (!trimmed) {
                // Empty reply: let higher-level chat logic handle it
                return false;
            }

            const selection = await this.interpretPostActionsSelection(trimmed, followUps);
            if (!selection) {
                return false;
            }

            // SDK Standard: 새로운 작업이면 후속 작업 선택을 취소하고 일반 처리로 진행
            if (selection.isNewTask === true) {
                this.developerLogService.log(`User input interpreted as new task, canceling follow-up selection.`);
                this.isAwaitingPostActionsConfirmation = false;
                this.pendingPostActions = [];
                return false; // 일반 처리로 진행
            }

            let { runAll, skipAll, indices } = selection;

            // If user clearly wants to skip or result is effectively empty, treat as skip-all
            if (skipAll || (!runAll && indices.length === 0)) {
                this.isAwaitingPostActionsConfirmation = false;
                this.pendingPostActions = [];
                this.suppressPostActionsSuggestions = true;

                const text = 'Understood. I will skip the follow-up tasks.';
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

            if (runAll) {
                indices = followUps.map((_, i) => i + 1);
            }

            const zeroBased = indices
                .map(i => i - 1)
                .filter(i => i >= 0 && i < followUps.length);

            if (zeroBased.length === 0) {
                return false;
            }

            const selected = zeroBased.map(i => followUps[i]);

            // Initialize a mini-plan for the selected follow-up steps
            this.planId = uuidv4();
            this.deferredPostActions = [];
            this.pendingPostActions = [];
            this.isAwaitingPostActionsConfirmation = false;
            this.suppressPostActionsSuggestions = true;
            this.producedArtifacts.clear();
            this.currentPlan = selected.map((desc: string, i: number) => ({
                id: `${this.planId}:${i + 1}`,
                description: desc,
                status: 'pending'
            }));
            this.currentStepIndex = -1;
            this.currentExecutionId = '';
            this.handledExecutions.clear();

            // Dynamic UI Text: Generate a natural language confirmation message
            // Dynamic UI Text: Generate a natural language confirmation message
            const list = followUps.map(f => `- ${f}`).join('\n');
            const prompt = `You are Viper, an AI coding assistant.
The user has selected the following follow-up tasks to execute:
${list}

Generate a short, natural, and encouraging confirmation message to tell the user that you are starting these tasks.
- Do NOT use "I will now run..." or "Starting...". Be more conversational.
- Example: "Got it! I'm on it. Let's tackle these tasks."
- Example: "Understood. I'll get started on these right away."
- Keep it under 20 words.
- Output ONLY the message text.`;

            let text = 'Starting selected tasks...';
            try {
                const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
                const apiKeys = await this.configService.getApiKeys();
                const endpoint = this.configService.getEndpoint();
                const provider = this.configService.getLlmProvider();
                const timeout = 10000; // 10s timeout for quick UI response

                const lang = (vscode.env.language || 'en').toLowerCase();
                const sys = `Speak only in ${lang}.`;

                const resp = await this.llmService.requestLLMCompletion(
                    provider,
                    [{ role: 'system', content: sys }, { role: 'user', content: prompt }],
                    apiKeys[0] || '',
                    endpoint,
                    [],
                    model,
                    undefined,
                    timeout
                );
                const generated = (resp.choices?.[0]?.message?.content ?? (resp as any).choices?.[0]?.text ?? '').trim();
                if (generated) {
                    text = `${generated}\n\n${followUps.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
                } else {
                    text = `I will now run the selected follow-up tasks:\n${followUps.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
                }
            } catch (e) {
                // Fallback if LLM fails
                text = `I will now run the selected follow-up tasks:\n${followUps.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
            }

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
        } catch (e: any) {
            this.developerLogService.log(`[OrchestratorAgent] Error in handlePostActionsConfirmation: ${e?.message || String(e)}`);
            return false;
        }
    }

    private async interpretPostActionsSelection(userText: string, followUps: string[]): Promise<{ isNewTask?: boolean; runAll: boolean; skipAll: boolean; indices: number[] } | null> {
        const userLanguage = vscode.env.language || 'en';
        const prompt = getPostActionsSelectionPrompt(userLanguage, userText, followUps, this.llmConversationHistory);

        const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
        const apiKeys = await this.configService.getApiKeys();
        const endpoint = this.configService.getEndpoint();
        const provider = this.configService.getLlmProvider();
        const timeout = this.configService.getRequestTimeout(OrchestratorAgent.AGENT_ID);

        const selectionSchema = {
            type: 'object',
            properties: {
                is_new_task: { type: 'boolean' },
                is_followup_selection: { type: 'boolean' },
                run_all: { type: 'boolean' },
                skip_all: { type: 'boolean' },
                selected_indices: {
                    type: 'array',
                    items: { type: 'integer', minimum: 1 }
                },
                reason: { type: 'string' }
            },
            required: ['is_new_task', 'is_followup_selection', 'run_all', 'skip_all', 'selected_indices', 'reason'],
            additionalProperties: true
        } as any;

        let raw = '';
        try {
            const resp = await this.llmService.requestLLMCompletion(
                provider,
                [{ role: 'user', content: prompt }],
                apiKeys[0] || '',
                endpoint,
                [],
                model,
                undefined,
                timeout,
                { structured: { mode: 'json_schema', schema: selectionSchema, schemaName: 'PostActionSelection' } }
            );
            raw = (resp as any)?.choices?.[0]?.message?.content ?? (resp as any)?.choices?.[0]?.text ?? '';
            raw = (raw || '').toString().trim();
        } catch (e: any) {
            this.developerLogService.log(`[OrchestratorAgent] Failed LLM post-actions selection: ${e?.message || String(e)}`);
        }

        if (!raw) {
            return null;
        }

        // Strip any thought/meta wrapper before JSON parsing
        const parsedView = this.parseThoughtAndUserFacingText(raw || null);
        let candidate = (parsedView.userFacingText || raw || '').toString().trim();

        let selection: any = null;
        // 1) Direct JSON
        try {
            if (candidate) {
                selection = JSON.parse(candidate);
            }
        } catch {}
        // 2) JSON inside code block
        if (!selection) {
            try {
                const match = candidate.match(/```[a-zA-Z0-9]*\n([\s\S]*?)```/);
                const within = match ? match[1] : candidate;
                if (within) {
                    selection = JSON.parse(within);
                }
            } catch {}
        }
        // 3) Slice between first '{' and last '}'
        if (!selection) {
            try {
                const first = candidate.indexOf('{');
                const last = candidate.lastIndexOf('}');
                if (first !== -1 && last !== -1 && last > first) {
                    const slice = candidate.slice(first, last + 1);
                    selection = JSON.parse(slice);
                }
            } catch {}
        }

        if (!selection || typeof selection !== 'object') {
            return null;
        }

        // SDK Standard: 새로운 작업인지 확인
        const isNewTask = selection.is_new_task === true && selection.is_followup_selection !== true;
        if (isNewTask) {
            return { isNewTask: true, runAll: false, skipAll: false, indices: [] };
        }

        const runAll = !!selection.run_all;
        const skipAll = !!selection.skip_all;
        const indices: number[] = Array.isArray(selection.selected_indices)
            ? selection.selected_indices.filter((n: any) => Number.isInteger(n) && n >= 1)
            : [];

        return { isNewTask: false, runAll, skipAll, indices };
    }

    private async sendFullSettingsToUI() {
        const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
        const endpoint = this.configService.getEndpoint();
        const provider = this.configService.getLlmProvider();
        const developerMode = this.configService.getDeveloperMode();
        const apiKeys = await this.configService.getApiKeys();
        this._onDidPostMessage.fire({
            command: 'settingsUpdate',
            payload: {
                model: model,
                endpoint: endpoint,
                provider: provider,
                apiKeyPresent: apiKeys.length > 0,
                alwaysAcceptSuggestions: this.isAcceptAlwaysActive,
                developerMode: developerMode
            }
        });
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
            if (/^(n|no|cancel|stop|wait|deny|reject|아니|싫어|취소|이전|멈춰|ㄴㄴ)/i.test(userText)) return 'deny';
            return 'uncertain';
        }
    }


    private async handleChatAndSpecialistCommands(userText: string, messageId?: string): Promise<void> { // Make it async
        if (messageId && this.processedMessageIds.has(messageId)) {
            console.log(`[OrchestratorAgent] Skipping already processed message ID: ${messageId}`);
            return;
        }
        if (messageId) {
            this.processedMessageIds.add(messageId);
        }

        const sessionId = this.activeSessionId; // Capture session ID at start
        if (!userText) { return; }

        // Store original user query for agents that need context (e.g., BrainstormAgent)
        this.lastUserQuery = userText;

        // SDK Standard: Centralized storage
        // Check if already in history (double safety)
        const isIdDuplicate = messageId && this.chatHistory.some(m => m.messageId === messageId);
        
        // Synchronous Debounce: Check if we are already processing this exact text (race condition fix)
        // This prevents double-submits where chatHistory hasn't updated yet.
        if (this.recentQueryDebounce.has(userText)) {
             console.log(`[OrchestratorAgent] Skipping debounced content: "${userText.slice(0, 20)}..."`);
             return;
        }

        if (isIdDuplicate) {
            console.log(`[OrchestratorAgent] Skipping duplicate message ID: ${messageId}`);
            return;
        }
        
        // Lock this content for 2 seconds
        this.recentQueryDebounce.add(userText);
        setTimeout(() => this.recentQueryDebounce.delete(userText), 2000);

        const userMessage: ChatMessage = { 
            author: 'user', 
            content: [{ type: 'text', text: userText }], 
            senderName: 'User', 
            timestamp: new Date().toISOString(),
            messageId: messageId
        };
        await this.addMessageToHistory(userMessage);

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
            this.llmConversationHistory.push({ role: 'user', content: userText });
        }

        const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
        const apiKeys = await this.configService.getApiKeys();
        const endpoint = this.configService.getEndpoint();
        const provider = this.configService.getLlmProvider();

        // Bug-fix detection removed - LLM will handle intent detection

        const taskTypePrompt = getTaskTypePrompt(userText, this.llmConversationHistory);

        try {
            const reqTimeout = this.configService.getRequestTimeout(OrchestratorAgent.AGENT_ID);
            const classificationTimeout = Math.min(Math.max(10000, (typeof reqTimeout === 'number' && reqTimeout > 0) ? reqTimeout : 20000), 25000);
            const classificationPromise = this.llmService.requestLLMCompletion(
                provider,
                [{ role: 'user', content: taskTypePrompt }], // Classification prompt with full conversation history
                apiKeys[0] || '',
                endpoint,
                [],
                model,
                undefined,
                classificationTimeout
            );
            const response = await Promise.race([
                classificationPromise,
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ClassificationTimeout')), classificationTimeout))
            ]);
            const llmContentRaw = (response.choices?.[0]?.message?.content ?? (response as any).choices?.[0]?.text ?? '').toString().trim();
            const { userFacingText: cleanedLlmContent } = this.parseThoughtAndUserFacingText(llmContentRaw || null);

            let classification: {
                intent_type?: 'info_query' | 'code_implementation' | 'code_modification' | 'conversation';
                is_complex_task: boolean;
                complexity_score?: number;
                expected_steps?: number;
                affected_scope?: string;
                complexity_reasons?: string[]
            } | null = null;
            try {
                let candidate = cleanedLlmContent || '';
                if (!candidate) { candidate = llmContentRaw; }
                let parsed: any = null;
                try { parsed = JSON.parse(candidate); }
                catch {
                    const codeBlockMatch = candidate.match(/```[a-zA-Z0-9]*\n([\s\S]*?)```/);
                    const within = codeBlockMatch ? codeBlockMatch[1] : candidate;
                    const first = within.indexOf('{');
                    const last = within.lastIndexOf('}');
                    if (first !== -1 && last !== -1 && last > first) {
                        const slice = within.slice(first, last + 1);
                        parsed = JSON.parse(slice);
                    } else {
                        throw new Error('No JSON object found');
                    }
                }
                classification = parsed;
            } catch (error) {
                console.error('[OrchestratorAgent] Failed to parse LLM task classification as JSON:', error);
                this.developerLogService.log(`Failed to parse LLM task classification as JSON: ${error}. Raw content: ${llmContentRaw}`);
            }

            // If classification failed and we likely have a connection/timeout error, surface it and stop.
            if (!classification) {
                const rawLower = (llmContentRaw || '').toLowerCase();
                if (rawLower.includes('connection error') || rawLower.includes('timed out')) {
                    const errorText = llmContentRaw || 'Connection error. Unable to reach the LLM service.';
                    const agentMessage: ChatMessage = { author: 'agent', content: [{ type: 'text', text: errorText }], senderName: OrchestratorAgent.AGENT_ID, timestamp: new Date().toISOString() };
                    await this.addMessageToHistory(agentMessage);
                    this.postMessageToSession(sessionId, 'response', { text: errorText, senderName: agentMessage.senderName, timestamp: agentMessage.timestamp });
                    await this.saveCurrentChatHistory();
                    await this.saveCurrentLlmHistory();
                    return;
                }
            }

            // Handle info_query intent first - use MCP tools directly without agent routing
            if (classification && classification.intent_type === 'info_query') {
                this.developerLogService.log(`User query classified as info_query: "${userText}". Handling directly with MCP tools.`);
                await this.handleInfoQuery(userText, classification, sessionId);
                return;
            }

            if (classification && classification.is_complex_task) {
                const complexityScore = classification.complexity_score || 50;
                const expectedSteps = classification.expected_steps || 3;
                const affectedScope = classification.affected_scope || 'multiple files';
                const complexityReasons = classification.complexity_reasons || ['Multiple steps required'];

                // BrainstormAgent는 Uroboros Mode에서만 사용
                if (!this.autonomousMode) {
                    // SDK Standard: 이전에 거절한 요청인지 확인
                    const queryKey = userText.trim().toLowerCase();
                    const wasDeclined = this.declinedUroborosQueries.has(queryKey);

                    // 복잡도 점수가 75 이상이고, 입력 길이가 10자 이상이며, 세션에서 제안을 무시하지 않았고, 이전에 거절하지 않았으면 Uroboros Mode 제안
                    if (complexityScore >= 75 && userText.length >= 10 && !this.sessionSuppressComplexityPrompt && !wasDeclined) {
                        this.developerLogService.log(`User query classified as complex (score: ${complexityScore}). Proposing Uroboros Mode.`);

                        // SDK Standard: LLM이 Uroboros Mode 제안 텍스트 생성
                        const langCodeRaw = (vscode.env.language || 'en').toLowerCase();
                        const baseLangCode = (langCodeRaw.split('-')[0] || langCodeRaw);
                        const proposalPrompt = `System: You are Viper, an expert coding partner. The user has requested a task that may be complex.

Task details:
- User request: "${userText}"
- Complexity score: ${complexityScore}/100
- Expected steps: ${expectedSteps}
- Affected scope: ${affectedScope}
${complexityReasons && complexityReasons.length > 0 ? `- Complexity reasons:\n${complexityReasons.map(r => `  - ${r}`).join('\n')}` : ''}

Your task:
Write a natural, conversational message proposing Uroboros Mode (a structured planning approach) to the user.
- Be terse and direct
- Explain why this task might benefit from structured planning
- Ask if they want to use Uroboros Mode
- Use the user's language (${baseLangCode})
- Do NOT use keywords or templates - write naturally based on the context

Output ONLY the proposal message text. No markdown, no code fences, no JSON.`;

                        let proposalText = '';
                        try {
                            const proposalResponse = await this.llmService.requestLLMCompletion(
                                provider,
                                [{ role: 'user', content: proposalPrompt }],
                                apiKeys[0] || '',
                                endpoint,
                                [],
                                model,
                                undefined,
                                Math.min(Math.max(10000, this.configService.getRequestTimeout(OrchestratorAgent.AGENT_ID) || 20000), 25000)
                            );
                            proposalText = (proposalResponse.choices?.[0]?.message?.content ?? (proposalResponse as any).choices?.[0]?.text ?? '').toString().trim();
                        } catch (e: any) {
                            this.developerLogService.log(`[OrchestratorAgent] Failed to generate Uroboros Mode proposal: ${e?.message || e}`);
                            // Fallback to simple message
proposalText = `This task may be complex (complexity: ${complexityScore}/100). Would you like to use Uroboros Mode for a more structured approach?`;
                        }

                        const proposalMessage: ChatMessage = {
                            author: 'agent',
                            content: [{ type: 'text', text: proposalText }],
                            senderName: OrchestratorAgent.AGENT_ID,
                            timestamp: new Date().toISOString(),
                            kind: 'uroboros-proposal' as any,
                            buttons: [
                                {
                                    label: '승인',
                                    command: 'acceptUroborosMode',
                                    payload: { userText },
                                    style: 'primary'
                                },
                                {
                                    label: '거절',
                                    command: 'declineUroborosMode',
                                    payload: { userText },
                                    style: 'secondary'
                                }
                            ]
                        };
                        await this.addMessageToHistory(proposalMessage);

                        this.postMessageToSession(sessionId, 'response', {
                            text: proposalText,
                            senderName: proposalMessage.senderName,
                            timestamp: proposalMessage.timestamp,
                            requiresUserInput: true,
                            uroborosProposal: {
                                userText,
                                complexityScore,
                                expectedSteps,
                                affectedScope,
                                complexityReasons
                            },
                            buttons: proposalMessage.buttons
                        });
                        
                        this.pendingUroborosProposal = { userText };
                        return;
                    }
                }

                this.developerLogService.log(`User query classified as complex: "${userText}". Routing to BrainstormAgent (Uroboros Mode enabled).`);
                // SDK Standard: Route complex tasks to BrainstormAgent for plan creation (Uroboros Mode only)
                // Note: User message is already added in newChat case, so we only add to LLM history here
                const alreadyAdded = this.chatHistory.some(m => 
                    (messageId && m.messageId === messageId) || 
                    (m.author === 'user' && m.content?.[0]?.text === userText)
                );
                if (!alreadyAdded) {
                    const userMessage: ChatMessage = { author: 'user', content: [{ type: 'text', text: userText }], senderName: 'User', timestamp: new Date().toISOString(), messageId: messageId };
                    await this.addMessageToHistory(userMessage);
                }
                this.llmConversationHistory.push({ role: 'user', content: userText });
                this.lastUserQuery = userText;

                // Correlation payload
                const stepId = (this.currentStepIndex >= 0 && this.currentStepIndex < this.currentPlan.length) ? this.currentPlan[this.currentStepIndex].id : '';
                const correlation = { planId: this.planId, workflowId: this.planId, stepId, executionId: this.currentExecutionId, runId: this.currentExecutionId, sessionId: this.activeSessionId } as any;
                if (!this.brainstormContextId) { this.brainstormContextId = uuidv4(); }

                // SDK Standard: Send user query to BrainstormAgent
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
                return;
            } else {
                this.developerLogService.log(`User query classified as simple: "${userText}". Responding conversationally.`);
                // Directly route to Conversational agent for simple queries
                // We need to get a conversational response from LLM
                const convTimeout = Math.min(Math.max(10000, this.configService.getRequestTimeout(OrchestratorAgent.AGENT_ID) || 60000), 25000);
                const streaming = this.configService.isStreamingEnabled(OrchestratorAgent.AGENT_ID);
                const langCodeRaw = (vscode.env.language || 'en').toLowerCase();
                const baseLangCode = (langCodeRaw.split('-')[0] || langCodeRaw);

                // MCP SDK Standard: Use tool calling loop for conversational flow (same as handleInfoQuery)
                const mcpClient = getMcpClient();

                // Dynamically fetch tools from MCP server
                let tools: any[] = [];
                try {
                    const mcpClientAny = mcpClient as any;
                    if (typeof mcpClientAny.listTools === 'function') {
                        const toolsList = await mcpClientAny.listTools();
                        if (toolsList?.tools && Array.isArray(toolsList.tools)) {
                            tools = toolsList.tools.map((tool: any) => {
                                const inputSchema = tool.inputSchema || {};
                                const properties: any = {};
                                const required: string[] = [];

                                if (inputSchema.properties && typeof inputSchema.properties === 'object') {
                                    for (const [key, value] of Object.entries(inputSchema.properties)) {
                                        properties[key] = value;
                                    }
                                }
                                if (Array.isArray(inputSchema.required)) {
                                    required.push(...inputSchema.required);
                                }

                                // MCP SDK Standard: Preserve full tool description for better LLM understanding
                                const toolDescription = tool.description?.description || tool.description || tool.title || '';
                                const toolTitle = tool.description?.title || tool.name;

                                return {
                                    type: 'function',
                                    function: {
                                        name: tool.name,
                                        description: toolDescription || `${toolTitle}: ${tool.name}`,
                                        parameters: {
                                            type: 'object',
                                            properties,
                                            required: required.length > 0 ? required : undefined,
                                            additionalProperties: false
                                        }
                                    }
                                };
                            });
                            this.developerLogService.log(`[OrchestratorAgent] Loaded ${tools.length} tools for conversational flow: ${tools.map((t: any) => t.function?.name || t.name || 'unknown').join(', ')}`);
                        }
                    }
                } catch (e: any) {
                    console.warn(`[OrchestratorAgent] Failed to get tools from MCP:`, e?.message || e);
                    tools = getCoreLLMTools(provider);
                }

                if (tools.length === 0) {
                    tools = getCoreLLMTools(provider);
                }

                console.log(`[OrchestratorAgent] Tools loaded for conversational flow: ${tools.length} tools`);
                console.log(`[OrchestratorAgent] Tool names: ${tools.map((t: any) => t.function?.name || t.name || 'unknown').join(', ')}`);

                // Build system message with tool usage instructions (includes available tools list)
                // Get workspace roots for context
                const ws = vscode.workspace.workspaceFolders;
                const workspaceRoots = ws ? ws.map(f => f.uri.fsPath) : [process.cwd()];

                const systemInstructionsRaw = await getConversationalPrompt('', this.llmConversationHistory, tools, {
                    provider,
                    model,
                    locale: baseLangCode,
                    ideLanguage: langCodeRaw,
                    mcpEnabled: tools.length > 0,
                    workspaceRoots,
                    uroborosMode: this.autonomousMode,
                });
                const systemInstructions = (typeof systemInstructionsRaw === 'string' ? systemInstructionsRaw : String(systemInstructionsRaw || '')).replace('User: ""', '').trim();

                console.log(`[OrchestratorAgent] Generated prompt length: ${systemInstructions.length}`);
                console.log(`[OrchestratorAgent] Prompt contains "Available Tools": ${systemInstructions.includes('Available Tools')}`);
                console.log(`[OrchestratorAgent] Prompt contains "FileWriteTool": ${systemInstructions.includes('FileWriteTool') || systemInstructions.includes('file write')}`);
                console.log(`[OrchestratorAgent] Prompt contains "tool_calls": ${systemInstructions.includes('tool_calls') || systemInstructions.includes('tool calls')}`);
                
                // Dynamic Context Loading
                let dynamicContext = '';
                try {
                    dynamicContext = await this.contextService.loadContext(userText);
                    if (dynamicContext) {
                        this.developerLogService.log(`[OrchestratorAgent] Loaded dynamic context for query: "${userText.slice(0, 50)}..."`);
                    }
                } catch (e) {
                    console.warn(`[OrchestratorAgent] Failed to load dynamic context:`, e);
                }

                const localeSystem = systemInstructions;

                // Build conversation history: system message + actual conversation history + current user prompt
                const convoHistory: LlmMessage[] = [
                    { role: 'system', content: localeSystem } as LlmMessage,
                    ...this.llmConversationHistory.slice(-10), // Last 10 messages for context
                    { role: 'user', content: userText } as LlmMessage // Direct user text
                ];

                // MCP SDK Standard: Tool calling loop
                const messages: LlmMessage[] = convoHistory;
                let maxIterations = 5;
                let finalResponse = '';
                let hasStartedStreaming = false;
                let hadToolCalls = false;
                let confirmationRequested = false;

                try {
                while (maxIterations-- > 0) {
                    let response;
                    try {
                        this.developerLogService.log(`[OrchestratorAgent] Calling LLM (iteration ${5 - maxIterations}/${5})...`);
                        console.log(`[OrchestratorAgent] About to call requestLLMCompletion...`);
                        
                        // [Fix for Autonomous Execution]
                        // If we are NOT in autonomous mode, and hadToolCalls is true (meaning we just ran tools),
                        // we disable tools for this next call to force a summary/interpretation and prevent chaining.
                        const currentTools = (!this.autonomousMode && hadToolCalls) ? [] : tools;

                        response = await this.llmService.requestLLMCompletion(
                            provider,
                            messages,
                            apiKeys[0] || '',
                            endpoint,
                            currentTools,
                            model,
                            streaming ? (chunk: string) => {
                                if (!hasStartedStreaming) {
                                    this.postMessageToSession(sessionId, 'responseStart', {});
                                    hasStartedStreaming = true;
                                }
                                if (hasStartedStreaming) {
                                    this.postMessageToSession(sessionId, 'responseChunk', { text: chunk });
                                }
                            } : undefined,
                            convTimeout
                        );
                        console.log(`[OrchestratorAgent] requestLLMCompletion returned. Response type: ${typeof response}, has choices: ${!!response?.choices}`);
                        console.log(`[OrchestratorAgent] LLM response received. Has choices: ${!!response?.choices}, choices length: ${response?.choices?.length || 0}`);
                        console.log(`[OrchestratorAgent] response.choices[0] exists: ${!!response?.choices?.[0]}`);
                        console.log(`[OrchestratorAgent] response.choices[0].message exists: ${!!response?.choices?.[0]?.message}`);
                        console.log(`[OrchestratorAgent] response.choices[0].message.content type: ${typeof response?.choices?.[0]?.message?.content}, length: ${String(response?.choices?.[0]?.message?.content || '').length}`);
                        console.log(`[OrchestratorAgent] response.choices[0].message.content value: "${String(response?.choices?.[0]?.message?.content || '').slice(0, 200)}"`);
                        this.developerLogService.log(`[OrchestratorAgent] LLM response received. Has choices: ${!!response?.choices}, choices length: ${response?.choices?.length || 0}`);
                        console.log(`[OrchestratorAgent] After developerLogService.log call`);
                    } catch (error: any) {
                        console.error(`[OrchestratorAgent] Error calling LLM:`, error);
                        this.developerLogService.log(`[OrchestratorAgent] Error calling LLM: ${error?.message || error}`);
                        if (!finalResponse) {
                            finalResponse = `Error: ${error?.message || 'Failed to get response from LLM'}`;
                        }
                        break;
                    }

                    console.log(`[OrchestratorAgent] Checking if response is null/undefined...`);
                    if (!response) {
                        console.error(`[OrchestratorAgent] LLM returned null/undefined response`);
                        this.developerLogService.log(`[OrchestratorAgent] LLM returned null/undefined response`);
                        if (!finalResponse) {
                            finalResponse = 'I received an invalid response from the LLM. Please try again.';
                        }
                        break;
                    }

                    console.log(`[OrchestratorAgent] Response is valid, extracting assistantMessage...`);
                    const assistantMessage = response.choices?.[0]?.message;
                    console.log(`[OrchestratorAgent] assistantMessage extracted. Has message: ${!!assistantMessage}`);
                    if (!assistantMessage) {
                        console.log(`[OrchestratorAgent] No assistant message in response. Response structure: ${JSON.stringify(response).slice(0, 500)}`);
                        this.developerLogService.log(`[OrchestratorAgent] No assistant message in response. Response structure: ${JSON.stringify(response).slice(0, 500)}`);
                        console.error(`[OrchestratorAgent] No assistant message in response:`, response);
                        // If no message and no final response, set error message
                        if (!finalResponse && !hadToolCalls) {
                            finalResponse = 'I received an invalid response from the LLM. Please try again.';
                        }
                        break;
                    }

                    console.log(`[OrchestratorAgent] Assistant message received. Content type: ${typeof assistantMessage.content}, has content: ${!!assistantMessage.content}`);
                    console.log(`[OrchestratorAgent] assistantMessage.content value: "${String(assistantMessage.content || '').slice(0, 200)}"`);
                    console.log(`[OrchestratorAgent] assistantMessage.content length: ${String(assistantMessage.content || '').length}`);
                    console.log(`[OrchestratorAgent] assistantMessage keys: ${Object.keys(assistantMessage).join(', ')}`);
                    console.log(`[OrchestratorAgent] assistantMessage.tool_calls: ${JSON.stringify(assistantMessage.tool_calls || null)}`);
                    this.developerLogService.log(`[OrchestratorAgent] Assistant message received. Content type: ${typeof assistantMessage.content}, has content: ${!!assistantMessage.content}`);

                    console.log(`[OrchestratorAgent] Extracting tool_calls...`);
                    const toolCalls = assistantMessage.tool_calls;
                    console.log(`[OrchestratorAgent] toolCalls extracted. Has tool_calls: ${!!toolCalls}, length: ${toolCalls?.length || 0}`);
                    this.developerLogService.log(`[OrchestratorAgent] LLM response - has tool_calls: ${!!toolCalls && toolCalls.length > 0}, tool_calls count: ${toolCalls?.length || 0}, content length: ${(assistantMessage.content || '').toString().length}`);
                    if (toolCalls && toolCalls.length > 0) {
                        console.log(`[OrchestratorAgent] Tool calls received: ${toolCalls.map((tc: any) => tc.function?.name || 'unknown').join(', ')}`);
                        this.developerLogService.log(`[OrchestratorAgent] Tool calls received: ${toolCalls.map((tc: any) => tc.function?.name || 'unknown').join(', ')}`);
                    }

                    // If there are tool calls, ignore the content (it may contain THOUGHT tags or explanations)
                    // Only use content if there are no tool calls
                    console.log(`[OrchestratorAgent] Checking if tool_calls exist...`);
                    if (!toolCalls || toolCalls.length === 0) {
                        console.log(`[OrchestratorAgent] No tool_calls, processing content as final response...`);
                        const rawContent = (assistantMessage.content ?? '').toString().trim();
                        console.log(`[OrchestratorAgent] rawContent length: ${rawContent.length}, rawContent: "${rawContent.slice(0, 200)}"`);
                        // Parse and clean THOUGHT tags before using as final response
                        const { userFacingText } = this.parseThoughtAndUserFacingText(rawContent);
                        console.log(`[OrchestratorAgent] After parseThoughtAndUserFacingText. userFacingText length: ${userFacingText?.length || 0}, userFacingText: "${userFacingText?.slice(0, 200) || ''}"`);
                        finalResponse = userFacingText || rawContent;
                        console.log(`[OrchestratorAgent] finalResponse set. Length: ${finalResponse.length}, content: "${finalResponse.slice(0, 100)}"`);
                        messages.push(assistantMessage);
                        console.log(`[OrchestratorAgent] Breaking from loop (no tool_calls)`);
                        break;
                    }

                    console.log(`[OrchestratorAgent] Tool_calls exist, processing tool execution...`);

                    // Mark that we had tool calls
                    hadToolCalls = true;

                    // If tool calls exist, add the assistant message with tool_calls
                    // Keep original content but clean THOUGHT tags if present
                    // Some LLM APIs need content to be present even with tool_calls
                    let cleanedContent = (assistantMessage.content ?? '').toString();
                    if (cleanedContent) {
                        const { userFacingText } = this.parseThoughtAndUserFacingText(cleanedContent);
                        cleanedContent = userFacingText || cleanedContent;
                    }
                    const cleanAssistantMessage = {
                        ...assistantMessage,
                        content: cleanedContent // Keep cleaned content for API compatibility
                    };
                    messages.push(cleanAssistantMessage as any);

                    // Execute tool calls
                    // Optimization: Execute independent read tools in parallel
                    const toolResults: LlmMessage[] = [];
                    const toolPromises = toolCalls.map(async (toolCall: any) => {
                        try {
                            const toolName = toolCall.function?.name;
                            // Handle arguments - could be string (JSON) or already an object
                            let toolArgs: any;
                            if (typeof toolCall.function?.arguments === 'string') {
                                try {
                                    toolArgs = JSON.parse(toolCall.function.arguments);
                                } catch (e) {
                                    console.error(`[OrchestratorAgent] Failed to parse tool arguments as JSON:`, toolCall.function.arguments);
                                    toolArgs = {};
                                }
                            } else if (typeof toolCall.function?.arguments === 'object' && toolCall.function?.arguments !== null) {
                                toolArgs = toolCall.function.arguments;
                            } else {
                                toolArgs = {};
                            }
                            console.log(`[OrchestratorAgent] Parsed tool args for ${toolName}:`, JSON.stringify(toolArgs).slice(0, 200));

                            // Pre-execution check for FileWriteTool to determine if it's a Create or Update
                            let wasAlreadyExisting = false;
                            if (toolName === 'FileWriteTool') {
                                const filePath = toolArgs.filePath || toolArgs.path;
                                if (filePath) {
                                    try {
                                        await fs.access(filePath);
                                        wasAlreadyExisting = true;
                                    } catch {
                                        wasAlreadyExisting = false;
                                    }
                                }
                            }
                            // Sanitize content for FileWriteTool to fix literal \n issues
                            if (toolName === 'FileWriteTool' && toolArgs.content) {
                                // If content has literal "\n" strings but NO actual newlines, it's likely a flattened string.
                                // In this case, we unescape the newlines. 
                                // We avoid doing this if actual newlines exist, to preserve literal "\n" in things like print("\n")
                                if (typeof toolArgs.content === 'string' && toolArgs.content.includes('\\n') && !toolArgs.content.includes('\n')) {
                                   toolArgs.content = toolArgs.content.replace(/\\n/g, '\n');
                                }
                            }


                            this.developerLogService.log(`[OrchestratorAgent] Executing tool in conversational flow: ${toolName}`);

                            // Show progress log for MCP tool execution
                            const toolDisplayName = toolName || 'Unknown tool';
                            const toolArgsStr = Object.keys(toolArgs).length > 0
                                ? ` with ${Object.keys(toolArgs).join(', ')}`
                                : '';
                            this.postMessageToSession(sessionId, 'progressLog', { text: `[MCP] Executing ${toolDisplayName}${toolArgsStr}...` });

                            const toolResult = await mcpClient.callTool({
                                name: toolName,
                                arguments: toolArgs
                            } as any);

                            // Show completion log
                            this.postMessageToSession(sessionId, 'progressLog', { text: `[MCP] ${toolDisplayName} completed` });

                            // Handle ThinkTool - display thought in UI
                            if (toolName === 'ThinkTool') {
                                const thoughtContent = toolArgs.thought;
                                if (thoughtContent) {
                                    this.developerLogService.log(`[OrchestratorAgent] ThinkTool executed. Thought: ${thoughtContent.slice(0, 50)}...`);
                                    
                                    // Send thought to UI
                                    const thoughtMessage: ChatMessage = {
                                        author: 'agent',
                                        content: [],
                                        thought: thoughtContent,
                                        senderName: OrchestratorAgent.AGENT_ID,
                                        timestamp: new Date().toISOString()
                                    };
                                    await this.addMessageToHistory(thoughtMessage);
                                    this.postMessageToSession(sessionId, 'response', { 
                                        text: '', 
                                        thought: thoughtContent,
                                        senderName: thoughtMessage.senderName, 
                                        timestamp: thoughtMessage.timestamp 
                                    });

                                    return {
                                        role: 'tool',
                                        content: 'Thought recorded.',
                                        tool_call_id: toolCall.id,
                                        name: toolName
                                    } as any;
                                }
                            }

                            // Handle FileWriteTool result
                            if (toolName === 'FileWriteTool' && toolResult) {
                                const filePath = toolArgs.filePath || toolArgs.path;
                                if (filePath) {
                                    this.developerLogService.log(`[OrchestratorAgent] FileWriteTool executed. Updating UI for file: ${filePath}`);
                                    
                                    // Record artifact
                                    try {
                                        this.recordArtifact(filePath, 'created');
                                    } catch (e) {
                                        console.warn(`[OrchestratorAgent] Failed to record artifact:`, e);
                                    }

                                    // Run Linter to get summary for the UI card
                                    let lintSummary = '0 lint errors';
                                    try {
                                        const lintTimeoutMs = 15000;
                                        const lintResult = await Promise.race([
                                            mcpClient.callTool({
                                                name: 'LintTool',
                                                arguments: { paths: [filePath], fix: true }
                                            } as any),
                                            new Promise((_, reject) => setTimeout(() => reject(new Error('LintTool timed out')), lintTimeoutMs))
                                        ]);

                                        if (lintResult) {
                                            const errorCount = (lintResult as any).errorCount || 0;
                                            const warningCount = (lintResult as any).warningCount || 0;
                                            if (errorCount > 0 || warningCount > 0) {
                                                lintSummary = `${errorCount} error${errorCount !== 1 ? 's' : ''}, ${warningCount} warning${warningCount !== 1 ? 's' : ''}`;
                                                this.postMessageToSession(sessionId, 'progressLog', { text: `[Linter] ${lintSummary} in ${path.basename(filePath)}` });
                                            }
                                        }
                                    } catch (e: any) {
                                        this.developerLogService.log(`[OrchestratorAgent] Linter check failed: ${e?.message || e}`);
                                        lintSummary = 'Linter unavailable';
                                    }

                                    // Send UI update directly (createFileCard)
                                    // Use wasAlreadyExisting to correctly label "Create New File" vs "Update File"
                                    this.postMessageToSession(sessionId, 'createFileCard', {
                                        senderName: OrchestratorAgent.AGENT_ID,
                                        timestamp: new Date().toISOString(),
                                        filePath: filePath,
                                        relativePath: path.basename(filePath),
                                        title: wasAlreadyExisting ? 'Update File' : 'Create New File',
                                        suggestionType: wasAlreadyExisting ? 'edit-file' : 'create-file',
                                        lintSummary: lintSummary
                                    });

                                    // Trigger Post-Actions Suggestions (Follow-up Tasks)
                                    // SDK Standard: Provide next steps after any file operation
                                    // This ensures the "What about follow-up suggestions?" issue is resolved
                                    this.sendDirectActionSummary(filePath, OrchestratorAgent.AGENT_ID).catch(e => {
                                        console.error('[OrchestratorAgent] Failed to send direct action summary:', e);
                                    });
                                }
                            }

                            const resultContent = (toolResult as any)?.structuredContent
                                ? JSON.stringify((toolResult as any).structuredContent)
                                : ((toolResult as any)?.content?.find?.((b: any) => b?.type === 'text')?.text || JSON.stringify(toolResult));

                            toolResults.push({
                                role: 'tool',
                                content: resultContent,
                                tool_call_id: toolCall.id,
                                name: toolName
                            } as any);
                        } catch (error: any) {
                            console.error(`[OrchestratorAgent] Tool execution failed (${toolCall.function?.name}):`, error);
                            this.developerLogService.log(`[OrchestratorAgent] Tool execution failed (${toolCall.function?.name}): ${error.message}`);
                            
                            this.postMessageToSession(sessionId, 'progressLog', { text: `[MCP] ${toolCall.function?.name} failed: ${error.message}` });

                            return {
                                role: 'tool',
                                content: `Error executing tool ${toolCall.function?.name}: ${error.message}`,
                                tool_call_id: toolCall.id,
                                name: toolCall.function?.name
                            } as any;
                        }
                    });


                    // Wait for all tools to complete
                    const results = await Promise.all(toolPromises);
                    toolResults.push(...results);

                    // Stop here if strictly single-turn mode (non-Uroboros)
                    // If we just executed tools, we want to return results to the user and wait for their next command,
                    // UNLESS this is Uroboros mode which allows autonomous chains.
                    // Exception: If the LLM didn't produce any tools, we simply continue (likely just thinking/talking).
                    /*
                    if (!this.configService.getUroborosMode() && hadToolCalls) {
                         this.developerLogService.log(`[OrchestratorAgent] Non-Uroboros mode: Stopping loop after tool execution.`);
                         
                         // Force a final response if one wasn't generated yet so the loop exits gracefully
                         if (!finalResponse) {
                             // We don't set finalResponse string here to avoid double-printing, 
                             // but we break to stop further LLM calls.
                             // The logic below will handle 'no final response' by showing 'Task completed'.
                         }
                         break;
                    }
                    */
                    // [Refactoring Note]: The user wants strict control. Even if the LLM wants to continue, we must stop.
                    // However, we must ensure 'tool results' are fed back to the LLM *OR* shown to the user.
                    // Current architecture is: User -> LLM -> Tools -> LLM -> Final Response.
                    // If we break here, the second LLM call (to interpret tool results) never happens.
                    // This is actually BAD for things like "List files and tell me what you see".
                    // The standard "ReAct" loop *requires* one more call.
                    // So we allow *one* follow-up call (the natural loop behavior), but we should ensure `maxIterations` isn't abused.
                    // `maxIterations` is already 5. The issue is likely the LLM deciding to do *another* task after the first one.
                    
                    // Correct Fix: If tool calls happened, we allow the loop to continue SO THAT the LLM can see the output.
                    // BUT, we must ensure the NEXT LLM response doesn't trigger *new* tools if we want to be strict.
                    // A better approach for "User declined Uroboros" is that the specific 'Plan' logic shouldn't have started.
                    // This seems to be a deeper issue where the LLM *ignored* the user's "No".
                    // But to respect the "No Autonomous Mode" rule:
                    
                    if (!this.autonomousMode && hadToolCalls) {
                        // If we are NOT in Uroboros (Autonomous) mode, we should generally stop after tools are done 
                        // AND the LLM has had a chance to comment on them.
                        // However, to prevent "chaining" (Agent decides to do Task B after Task A without asking),
                        // we limit the remaining iterations to 1.
                        // This allows the LLM to see the tool output and give a final summary, but prevents it from starting a new tool execution cycle.
                        if (maxIterations > 1) {
                             this.developerLogService.log(`[OrchestratorAgent] Non-Uroboros mode (autonomousMode=false): Clamping maxIterations to 1 to allow strictly one follow-up (interpretation).`);
                             maxIterations = 1;
                        }
                    }
                }

                // If we have tool calls but no final response, don't show anything
                // (tool execution results will be handled in the next iteration or FileWriteTool handler)
                console.log(`[OrchestratorAgent] Loop ended. finalResponse: ${!!finalResponse}, finalResponse length: ${finalResponse?.length || 0}, hadToolCalls: ${hadToolCalls}, maxIterations remaining: ${maxIterations}`);
                this.developerLogService.log(`[OrchestratorAgent] Loop ended. finalResponse: ${!!finalResponse}, hadToolCalls: ${hadToolCalls}, maxIterations remaining: ${maxIterations}`);

                console.log(`[OrchestratorAgent] Checking finalResponse. !finalResponse: ${!finalResponse}, finalResponse.trim(): ${finalResponse?.trim() || 'empty'}`);
                if (!finalResponse || !finalResponse.trim()) {
                    console.log(`[OrchestratorAgent] finalResponse is empty or whitespace. hadToolCalls: ${hadToolCalls}`);
                    if (hadToolCalls) {
                        // Tool calls were executed, but LLM didn't provide a final response
                        if (!confirmationRequested) {
                            this.developerLogService.log(`[OrchestratorAgent] Tool calls executed but no final response. Requesting confirmation from LLM.`);
                            messages.push({ role: 'user', content: 'The tool has been executed successfully. Please provide a brief confirmation message to the user.' } as any);
                            confirmationRequested = true;
                            // continue; // Retry LLM with the new prompt (implicit loop)
                            // continue; // Retry LLM with the new prompt (implicit loop)
                        } else {
                            // We already asked, and it still returned empty. Fallback to hardcoded.
                            this.developerLogService.log(`[OrchestratorAgent] LLM returned empty response even after confirmation request. Using fallback.`);
                            finalResponse = 'Task completed.';
                        }
                        
                        // Do NOT close stream here, let the normal flow handle it with the new finalResponse
                        /*
                        if (hasStartedStreaming) {
                            this._onDidPostMessage.fire({ command: 'responseEnd', payload: {} });
                        }
                        */
                        // If we still have iterations left, the loop will continue automatically
                        // Otherwise, we return here
                        if (maxIterations <= 0) {
                            return; // Exit early - tool execution is sufficient
                        }
                        // Otherwise, continue the while loop
                    } else {
                        this.developerLogService.log(`[OrchestratorAgent] No final response and no tool calls. Setting error message.`);
                        finalResponse = 'I couldn\'t process that request.';
                    }
                }

                // Only parse and display if we have a final response
                console.log(`[OrchestratorAgent] Final response check: has finalResponse=${!!finalResponse}, length=${finalResponse?.length || 0}, trimmed length: ${finalResponse?.trim()?.length || 0}`);
                this.developerLogService.log(`[OrchestratorAgent] Final response check: has finalResponse=${!!finalResponse}, length=${finalResponse?.length || 0}`);

                if (finalResponse && finalResponse.trim()) {
                    console.log(`[OrchestratorAgent] finalResponse is valid, processing for UI...`);
                    const { thought, userFacingText } = this.parseThoughtAndUserFacingText(finalResponse || null);
                    const finalText = userFacingText || finalResponse;

                    // Skip if finalText is empty or only whitespace
                    if (!finalText || !finalText.trim()) {
                        this.developerLogService.log(`[OrchestratorAgent] Final text is empty after parsing. Closing stream if started.`);
                        if (hasStartedStreaming) {
                            this._onDidPostMessage.fire({ command: 'responseEnd', payload: {} });
                        }
                        return;
                    }

                    this.developerLogService.log(`[OrchestratorAgent] Sending final response to UI. Length: ${finalText.length}`);

                    // DO NOT send final response as progressLog - it will be shown in bubble
                    // progressLog is only for intermediate status updates, not final responses

                    if (streaming) {
                        if (!hasStartedStreaming) {
                            this.postMessageToSession(sessionId, 'responseStart', {});
                        }
                        this.postMessageToSession(sessionId, 'responseEnd', { thought: thought || undefined });
                    } else {
                        this.postMessageToSession(sessionId, 'responseStart', {});
                        this.postMessageToSession(sessionId, 'responseChunk', { text: finalText });
                        this.postMessageToSession(sessionId, 'responseEnd', { thought: thought || undefined });
                    }

                    // After responseEnd, send pending createFileCard
                    if ((this as any)._pendingFileCard) {
                        this.postMessageToSession(sessionId, 'createFileCard', (this as any)._pendingFileCard);
                        (this as any)._pendingFileCard = null;
                    }

                    const agentMessage: ChatMessage = {
                        author: 'agent',
                        content: [{ type: 'text', text: finalText }],
                        thought: thought || undefined,
                        senderName: OrchestratorAgent.AGENT_ID,
                        timestamp: new Date().toISOString()
                    };
                    await this.addMessageToHistory(agentMessage);
                    this.llmConversationHistory.push({ role: 'assistant', content: finalText });
                    await this.saveCurrentChatHistory();
                    await this.saveCurrentLlmHistory();
                    await this.updateSessionTitleSummary();
                } else {
                    // No final response but tool calls were executed
                    // This can happen if the LLM thinks the tool output is sufficient, but we should always confirm to the user.
                    this.developerLogService.log(`[OrchestratorAgent] No final response to send after tool execution. Generating fallback.`);
                    
                    let fallbackText = 'Task completed.';
                    // If we can infer context from the last tool call, that would be better, but for now a generic message is better than silence.
                    // If TaskCompletionTool was used, we can say "Task completed."
                    
                    // We should send this as a response so the user knows it's done.
                    if (streaming) {
                        if (!hasStartedStreaming) {
                            this.postMessageToSession(sessionId, 'responseStart', {});
                        }
                        this.postMessageToSession(sessionId, 'responseChunk', { text: fallbackText });
                        this.postMessageToSession(sessionId, 'responseEnd', {});
                    } else {
                        this.postMessageToSession(sessionId, 'responseStart', {});
                        this.postMessageToSession(sessionId, 'responseChunk', { text: fallbackText });
                        this.postMessageToSession(sessionId, 'responseEnd', {});
                    }

                    // After responseEnd, send pending createFileCard
                    if ((this as any)._pendingFileCard) {
                        this.postMessageToSession(sessionId, 'createFileCard', (this as any)._pendingFileCard);
                        // Do NOT send intermediate responses to UI for tool calls.
                        // Only log them.
                        this.developerLogService.log(`[OrchestratorAgent] Pending file card sent after fallback response.`);
                        (this as any)._pendingFileCard = null;
                    }

                    const agentMessage: ChatMessage = {
                        author: 'agent',
                        content: [{ type: 'text', text: fallbackText }],
                        senderName: OrchestratorAgent.AGENT_ID,
                        timestamp: new Date().toISOString()
                    };
                    await this.addMessageToHistory(agentMessage);
                    this.llmConversationHistory.push({ role: 'assistant', content: fallbackText });
                    await this.saveCurrentChatHistory();
                    await this.saveCurrentLlmHistory();
                    await this.updateSessionTitleSummary();
                }
                } catch (error: any) {
                    console.error(`[OrchestratorAgent] Error in conversational flow:`, error);
                    this.developerLogService.log(`[OrchestratorAgent] Error in conversational flow: ${error?.message || error}`);
                    if (!finalResponse) {
                        finalResponse = `Error: ${error?.message || 'An error occurred while processing your request'}`;
                    }
                    // Try to send error response
                    if (finalResponse) {
                        this.postMessageToSession(sessionId, 'responseStart', {});
                        this.postMessageToSession(sessionId, 'responseChunk', { text: finalResponse });
                        this.postMessageToSession(sessionId, 'responseEnd', {});
                    }
                }
            }
        } catch (error: any) {
            console.error('Error classifying user query:', error);
            this.developerLogService.log(`ERROR: Failed to classify user query. Falling back to plan creation. ${error?.message || String(error)}`);
            await this.createAndExecutePlan(userText); // Fallback to plan creation on error
        }
    }

    private async createAndExecutePlan(userText: string): Promise<void> {
        this.suppressPostActionsSuggestions = false; // Reset suppression for new user request
        this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: 'Creating a plan...' } });

        const userLanguage = vscode.env.language;
        const specialistAgentDescriptions = this._specialistAgentDescriptions;

        const planPrompt = getPlanPrompt(userLanguage, userText, specialistAgentDescriptions, this.autonomousMode);

        try {
            const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
            const apiKeys = await this.configService.getApiKeys();
            const endpoint = this.configService.getEndpoint();
            const provider = this.configService.getLlmProvider();
            const timeout = this.configService.getRequestTimeout(OrchestratorAgent.AGENT_ID);
            const planSchema = { type: 'array', items: { type: 'string' } } as any;
            const planPromise = this.llmService.requestLLMCompletion(
                provider,
                [{ role: 'user', content: planPrompt }],
                apiKeys[0] || '',
                endpoint,
                [],
                model,
                undefined,
                timeout,
                { structured: { mode: 'json_schema', schema: planSchema, schemaName: 'PlanSteps' } }
            );
            const planTimeoutMs = Math.min(Math.max(12000, timeout || 60000), 30000);
            let response: any;
            try {
                response = await Promise.race([
                    planPromise,
                    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('PlanTimeout')), planTimeoutMs))
                ]);
            } catch (e: any) {
                if (e && e.message === 'PlanTimeout') {
                    this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: 'Plan generation is slow; using a fast fallback.' } });
                    const fallbackSteps: string[] = [];
                    const attach = (this.lastAttachmentFilePaths && this.lastAttachmentFilePaths[0]) || '';
                    if (attach) {
                        fallbackSteps.push(`CommentGenerationAgent: Add comments to ${attach}`);
                    } else {
                        fallbackSteps.push(`${userText}`);
                    }
                    // Initialize new plan with correlation ids
                    this.planId = uuidv4();
                    this.deferredPostActions = [];
                    this.pendingPostActions = [];
                    this.isAwaitingPostActionsConfirmation = false;
                    this.suppressPostActionsSuggestions = false;
                    this.producedArtifacts.clear();
                    this.currentPlan = fallbackSteps.map((desc: string, i: number) => ({ id: `${this.planId}:${i + 1}`, description: desc, status: 'pending' }));
                    this.currentStepIndex = -1;
                    this.currentExecutionId = '';
                    this.handledExecutions.clear();
                    if (this.autonomousMode) {
                        // Show plan and request confirmation in autonomous mode
                        this._onDidPostMessage.fire({ command: 'displayPlan', payload: { plan: this.currentPlan } });
                        const planDetails = this.currentPlan.map((step, index) => `${index + 1}. ${step.description}`).join('\n');
                        const fullResponseMessage = `I created a simplified plan. Proceed?\n${planDetails}`;
                        const planCreatedMessage: ChatMessage = { author: 'agent', content: [{ type: 'text', text: fullResponseMessage }], senderName: OrchestratorAgent.AGENT_ID, timestamp: new Date().toISOString() };
                        await this.addMessageToHistory(planCreatedMessage);
                        this._onDidPostMessage.fire({ command: 'response', payload: { text: fullResponseMessage, senderName: planCreatedMessage.senderName, timestamp: planCreatedMessage.timestamp }});
                        this.pendingPlan = this.currentPlan.map(step => ({ ...step }));
                        this.isAwaitingPlanConfirmation = true;
                        await this.requestPlanConfirmation();
                        return;
                    } else {
                        // Normal mode: do not show plan; execute immediately
                        await this.executePlan();
                        return;
                    }
                }
                throw e;
            }
            const rawContent = (response.choices?.[0]?.message?.content ?? response.choices?.[0]?.text ?? '').toString().trim();

            if (rawContent) {
                console.log('[OrchestratorAgent] rawContent:', rawContent);

                // Extract thought (if any) and the user-facing text using the helper
                const { thought, userFacingText: cleaned } = this.parseThoughtAndUserFacingText(rawContent);

                // If a thought was present, log it and keep it in the LLM conversation history for future context
                if (thought) {
                    this.developerLogService.log(`[OrchestratorAgent] Extracted thought from LLM: ${thought}`);
                    // store thought as a system-level LLM message so it won't be shown to users but is available for routing
                    this.llmConversationHistory.push({ role: 'system', content: thought });
                    this.pruneLlmHistoryIfNeeded(); // Prune if history gets too long
                }

                // If model was instructed to use DIRECT_RESPONSE wrapper, prefer that and return immediately
                const directTagMatch = cleaned.match(/<DIRECT_RESPONSE>([\s\S]*?)<\/DIRECT_RESPONSE>/i);
                if (directTagMatch) {
                    const directText = directTagMatch[1].trim();
                    console.log('[OrchestratorAgent] Detected DIRECT_RESPONSE tag.');
                    const agentMessage: ChatMessage = { author: 'agent', content: [{ type: 'text', text: directText }], thought: thought, senderName: OrchestratorAgent.AGENT_ID, timestamp: new Date().toISOString() };
                    this.addMessageToHistory(agentMessage);
                    this.llmConversationHistory.push({ role: 'assistant', content: directText });
                    await this.saveCurrentChatHistory();
                    await this.saveCurrentLlmHistory();
                    this._onDidPostMessage.fire({ command: 'response', payload: { text: directText, thought: thought || undefined, senderName: agentMessage.senderName, timestamp: agentMessage.timestamp }});
                    return;
                }

                let planDescriptions: string[] | undefined;
                let isPlan = false;

                // 1) Try robust extractor first
                const extracted1 = this.extractPlanArray(cleaned);
                if (extracted1 && extracted1.length > 0) {
                    planDescriptions = extracted1;
                    isPlan = true;
                } else {
                    console.log('[OrchestratorAgent] First extraction failed. Attempting strict retry...');
                    // 2) Retry once with a stricter reminder prompt
                    const strictReminder = `\n\nIMPORTANT: Output ONLY a JSON array of step strings. No prose. No code fences. If unsure, output an empty array [].`;
                    const strictPlanPrompt = planPrompt + strictReminder;
                    try {
                        const retryResp = await this.llmService.requestLLMCompletion(
                            provider,
                            [{ role: 'user', content: strictPlanPrompt }],
                            apiKeys[0] || '',
                            endpoint,
                            [],
                            model,
                            undefined,
                            undefined,
                            { structured: { mode: 'json_schema', schema: planSchema, schemaName: 'PlanSteps' } }
                        );
                        const retryRaw = (retryResp.choices?.[0]?.message?.content ?? (retryResp as any).choices?.[0]?.text ?? '').toString().trim();
                        const { userFacingText: retryCleaned } = this.parseThoughtAndUserFacingText(retryRaw);
                        const extracted2 = this.extractPlanArray(retryCleaned || retryRaw || '');
                        if (extracted2 && extracted2.length > 0) {
                            planDescriptions = extracted2;
                            isPlan = true;
                        }
                    } catch (retryErr) {
                        console.log('[OrchestratorAgent] Strict retry for plan generation failed:', retryErr);
                    }
                }

                console.log('[OrchestratorAgent] isPlan after parsing attempt (with retry):', isPlan);

                if (isPlan && planDescriptions) {
                    // Initialize new plan with correlation ids
                    this.planId = uuidv4();
                    const deferRegex = /(documentationgenerationagent|readmegenerationagent|testgenerationagent)\s*:/i;
                    const mainSteps = (planDescriptions || []).filter((d: string) => !deferRegex.test(String(d)));
                    this.currentPlan = mainSteps.map((desc: string, i: number) => ({ id: `${this.planId}:${i + 1}`, description: desc, status: 'pending' }));
                    this.currentStepIndex = -1;
                    this.currentExecutionId = '';
                    this.handledExecutions.clear();
                    this.pruneLlmHistoryIfNeeded(); // Prune if history gets too long
                    const firstPendingIndex = this.currentPlan.findIndex(s => s.status === 'pending');
                    const firstDescription = firstPendingIndex !== -1 ? (this.currentPlan[firstPendingIndex].description || '') : '';
                    // Check if first step explicitly targets internal planning agents by exact agent name
                    const firstIsBrainstorm = firstDescription.toLowerCase().startsWith('brainstormagent:');
                    const firstIsTaskDecomp = firstDescription.toLowerCase().startsWith('taskdecompositionagent:');
                    if (firstIsBrainstorm || firstIsTaskDecomp) {
                        // Do NOT display plan yet; let internal planning agents run and then surface the final user-facing plan.
                        await this.executePlan();
                    } else {
                        if (this.autonomousMode) {
                            // Autonomous(Uroboros) mode: show plan and ask confirmation
                            this._onDidPostMessage.fire({ command: 'displayPlan', payload: { plan: this.currentPlan } });
                            const planDetails = this.currentPlan.map((step, index) => `${index + 1}. ${step.description}`).join('\n');
                            const fullResponseMessage = `I have created the following plan. Please review it and confirm to proceed:\n${planDetails}`;
                            const planCreatedMessage: ChatMessage = { author: 'agent', content: [{ type: 'text', text: fullResponseMessage }], senderName: OrchestratorAgent.AGENT_ID, timestamp: new Date().toISOString() };
                            await this.addMessageToHistory(planCreatedMessage);
                            this._onDidPostMessage.fire({ command: 'response', payload: { text: fullResponseMessage, senderName: planCreatedMessage.senderName, timestamp: planCreatedMessage.timestamp }});
                            this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: 'I have created a plan. Shall I proceed? Please reply with yes/ok to continue.' } });
                            this.pendingPlan = this.currentPlan.map(step => ({ ...step }));
                            this.isAwaitingPlanConfirmation = true;
                            await this.requestPlanConfirmation();
                        } else {
                            // Normal mode: surface plan briefly and show live checklist in PLAN widget, then execute
                            try {
                                // Only show the PLAN widget (no duplicate checklist in chat)
                                this._onDidPostMessage.fire({ command: 'displayPlan', payload: { plan: this.currentPlan } });
                            } catch {}
                            // Dispatch-time normalization maps legacy edit agents to CodeEditAgent
                            await this.executePlan();
                        }
                    }
                } else {
                    // Treat as direct conversational response
                    const displayText = cleaned || rawContent;
                    const agentMessage: ChatMessage = { author: 'agent', content: [{ type: 'text', text: displayText }], thought: thought, senderName: OrchestratorAgent.AGENT_ID, timestamp: new Date().toISOString() };
                    this.addMessageToHistory(agentMessage);
                    this.llmConversationHistory.push({ role: 'assistant', content: displayText });
                    await this.saveCurrentChatHistory();
                    await this.saveCurrentLlmHistory();
                    this._onDidPostMessage.fire({ command: 'response', payload: { text: displayText, senderName: agentMessage.senderName, timestamp: agentMessage.timestamp }});
                }


            } else {
                throw new Error('LLM failed to generate a plan.');
            }
        } catch (error) {
            console.error('Failed to create or parse plan:', error);
            this.handleError(error as Error);
        }
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

    private async requestPlanConfirmation(): Promise<void> {
        try {
            // Avoid calling LLM here to prevent unexpected outputs mixing into the confirmation flow
            const confirmationText = 'I have created a plan. Shall I proceed? Please reply with yes/ok to continue.';

            // Do not add to chat history; show as a non-intrusive status banner instead
            this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: confirmationText } });
            // Deep copy the plan to avoid reference issues
            this.pendingPlan = this.currentPlan.map(step => ({ ...step })); // Set the pending plan
            this.isAwaitingPlanConfirmation = true;
            await this.saveCurrentChatHistory();
            await this.saveCurrentLlmHistory();
        } catch (e) {
            this.handleError(e as any);
        }
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

    private async executePlan(): Promise<void> {
        try {
            if (this.currentPlan.length === 0) { return; }
            const nextStepIndex = this.currentPlan.findIndex(step => step.status === 'pending');
            if (nextStepIndex === -1) {
                if (this.isCompletingPlan) { return; }
                this.isCompletingPlan = true;
                try {
                    const statusText = AgentMessages.orchestrator.planFinished;
                    this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: statusText } });
                    await this.sendPlanCompletionSummary(false);
                } finally {
                    this.isCompletingPlan = false;
                    this.currentPlan = [];
                    // Reset dispatch guards on plan completion
                    this.lastDispatchedStep = '';
                    this.lastDispatchedAt = 0;
                    // Reset correlation
                    this.planId = '';
                    this.currentStepIndex = -1;
                    this.currentExecutionId = '';
                    this.handledExecutions.clear();
                    this.producedArtifacts.clear();
                    await this.saveStateCheckpoint();
                }
                return;
            }

            const step = this.currentPlan[nextStepIndex];
            try { console.log(`[OrchestratorAgent] executePlan -> nextStepIndex=${nextStepIndex}, step="${step.description}"`); } catch {}
            this.currentPlan[nextStepIndex].status = 'in-progress';
            this._onDidPostMessage.fire({ command: 'updatePlanStep', payload: { index: nextStepIndex, status: 'in-progress' } });
            // Correlate this execution
            this.currentStepIndex = nextStepIndex;
            this.currentExecutionId = uuidv4();
            this.currentPlan[nextStepIndex].executionId = this.currentExecutionId;
            this.currentPlan[nextStepIndex].executionId = this.currentExecutionId;
            try { console.log(`[OrchestratorAgent] Correlation set -> planId=${this.planId}, stepId=${this.currentPlan[nextStepIndex].id}, executionId=${this.currentExecutionId}`); } catch {}
            
            await this.saveStateCheckpoint();

            await this.routeAndDelegate(step.description);
        } catch (error: any) {
            console.error('[OrchestratorAgent] Error executing plan step:', error);
            this.developerLogService.log(`ERROR: Failed to execute plan step. ${error.message}`);

            // Mark current step as error
            const currentStepIndex = this.currentPlan.findIndex(step => step.status === 'in-progress');
            if (currentStepIndex !== -1) {
                this.currentPlan[currentStepIndex].status = 'error';
                this._onDidPostMessage.fire({ command: 'updatePlanStep', payload: { index: currentStepIndex, status: 'error' } });
            }

            // Try to continue with next step, or finish plan if no more steps
            const nextStepIndex = this.currentPlan.findIndex(step => step.status === 'pending');
            if (nextStepIndex !== -1) {
                // Continue with next step
                this.developerLogService.log(`Continuing to next step after error.`);
                await this.executePlan();
            } else {
                // No more steps, mark plan as finished (with errors)
                const hasErrors = this.currentPlan.some(step => step.status === 'error');
                const statusText = hasErrors ? 'Plan finished with errors.' : 'Plan finished.';
                this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: statusText } });
                await this.sendPlanCompletionSummary(hasErrors);
                this.currentPlan = [];
                this.producedArtifacts.clear();
            }
        }
    }

    private async routeAndDelegate(stepDescription: string): Promise<void> {
        const specialistAgents = OrchestratorAgent.SPECIALIST_AGENTS;

        // Build agent descriptions including external agents
        const allAgents = [...OrchestratorAgent.SPECIALIST_AGENTS];
        for (const [name, info] of this.externalAgents) {
            allAgents.push({ name, description: info.description });
        }

        const specialistDescriptions = allAgents
            .map(agent => `- ${agent.name}: ${agent.description}`)
            .join('\n');

            const activeFile = this.contextService.getActiveFile();
            const lastSource = this.lastSourceFilePath;
            
            const routingPrompt = getRoutingPrompt(
                stepDescription, 
                specialistDescriptions, 
                { activeFile, lastSourceFile: lastSource }
            );

            // try { console.log('[OrchestratorAgent] Routing Prompt:', routingPrompt); } catch {}
        // System message should come first, followed by user message
        const messages: LlmMessage[] = [ { role: 'system', content: routingPrompt }, { role: 'user', content: stepDescription } ];

        try {
            const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
            const apiKeys = await this.configService.getApiKeys();
            const endpoint = this.configService.getEndpoint();
            const provider = this.configService.getLlmProvider();
            const timeout = this.configService.getRequestTimeout(OrchestratorAgent.AGENT_ID);

            // Manual timeout guard: if routing LLM call stalls, we will default to Conversational
            const routingSchema = { 
                type: 'object', 
                properties: { 
                    chosen_agent: { type: 'string' }, 
                    reason: { type: 'string' },
                    target_file: { type: 'string', description: 'The inferred target file name (e.g. dfs.py) if applicable.' }
                }, 
                required: ['chosen_agent', 'reason'] 
            } as any;
            const routingPromise = this.llmService.requestLLMCompletion(
                provider,
                messages,
                apiKeys[0] || '',
                endpoint,
                [],
                model,
                undefined,
                timeout,
                { structured: { mode: 'json_schema', schema: routingSchema, schemaName: 'RoutingDecision' } }
            );
            const routeTimeoutMs = timeout ? Math.max(10000, timeout) : 25000;
            let rawRoutingStr = '';
            try {
                const response = await Promise.race([
                    routingPromise,
                    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('RoutingTimeout')), routeTimeoutMs))
                ]);
                const rawRouting = (response as any).choices?.[0]?.message?.content ?? (response as any).choices?.[0]?.text ?? '';
                rawRoutingStr = (rawRouting || '').toString().trim();
            } catch (e: any) {
                if (e && e.message === 'RoutingTimeout') {
                    console.warn('[OrchestratorAgent] Routing LLM timed out. Defaulting to Conversational.');
                    this.developerLogService.log('Routing LLM timed out. Defaulting to Conversational.');
                } else {
                    throw e;
                }
            }
            const { userFacingText: cleanedLlmContent } = this.parseThoughtAndUserFacingText(rawRoutingStr || null);

            let parsedRoutingDecision: { chosen_agent: string, reason: string } | null = null;
            // 1) Try direct JSON
            try {
                if (cleanedLlmContent) {
                    parsedRoutingDecision = JSON.parse(cleanedLlmContent);
                }
            } catch {}
            // 2) Try from code block
            if (!parsedRoutingDecision) {
                try {
                    const match = (cleanedLlmContent || '').match(/```[a-zA-Z0-9]*\n([\s\S]*?)```/);
                    const within = match ? match[1] : (cleanedLlmContent || '');
                    if (within) {
                        parsedRoutingDecision = JSON.parse(within);
                    }
                } catch {}
            }
            // 3) Slice between first '{' and last '}'
            if (!parsedRoutingDecision) {
                try {
                    const candidate = cleanedLlmContent || rawRoutingStr || '';
                    const first = candidate.indexOf('{');
                    const last = candidate.lastIndexOf('}');
                    if (first !== -1 && last !== -1 && last > first) {
                        const slice = candidate.slice(first, last + 1);
                        parsedRoutingDecision = JSON.parse(slice);
                    }
                } catch {}
            }
            // 4) Retry once with strict reminder
            if (!parsedRoutingDecision) {
                try {
                    const strictReminder = `\n\nIMPORTANT: Output ONLY valid JSON: {\"chosen_agent\": string, \"reason\": string}. No prose. No code fences.`;
                    const strictMessages: LlmMessage[] = [ { role: 'system', content: routingPrompt + strictReminder }, { role: 'user', content: stepDescription } ];
                    const retry = await this.llmService.requestLLMCompletion(
                        provider,
                        strictMessages,
                        apiKeys[0] || '',
                        endpoint,
                        [],
                        model,
                        undefined,
                        timeout,
                        { structured: { mode: 'json_schema', schema: routingSchema, schemaName: 'RoutingDecision' } }
                    );
                    const retryRaw = (retry.choices?.[0]?.message?.content ?? (retry as any).choices?.[0]?.text ?? '').toString().trim();
                    const { userFacingText: retryClean } = this.parseThoughtAndUserFacingText(retryRaw || null);
                    try {
                        parsedRoutingDecision = JSON.parse(retryClean || retryRaw || '');
                    } catch {}
                    if (!parsedRoutingDecision) {
                        const first = (retryClean || retryRaw || '').indexOf('{');
                        const last = (retryClean || retryRaw || '').lastIndexOf('}');
                        if (first !== -1 && last !== -1 && last > first) {
                            parsedRoutingDecision = JSON.parse((retryClean || retryRaw || '').slice(first, last + 1));
                        }
                    }
                } catch (error) {
                    console.error('[OrchestratorAgent] Failed strict retry for routing JSON:', error);
                    this.developerLogService.log(`Failed strict retry for routing JSON: ${error}`);
                }
            }

            // SDK Standard: 실제로 등록된 Agent만 사용
            // 메인 작업용 Agent (6개)
            const registeredAgentNames = new Set([
                'BrainstormAgent',              // PLAN.md 생성 (브레인스토밍)
                'TaskDecompositionAgent',       // TASK.md 생성 (작업 분해)
                'CodeEditAgent',                // 파일 생성/수정
                'CodeAnalysisAgent',            // 심볼 검색 (ContextManagementAgent 의존)
                'RefactoringSuggestionAgent',   // 리팩토링 제안
                'ContextManagementAgent',       // 대화 컨텍스트 관리
                // 후속 작업용 Agent (3개) - deferRegex로 필터링됨
                'DocumentationGenerationAgent',
                'ReadmeGenerationAgent',
                'TestGenerationAgent'
            ]);
            
            // Dynamically add external agents from a2a-servers.json
            for (const [agentName] of this.externalAgents) {
                registeredAgentNames.add(agentName);
            }
            
            // 제거될 Agent (등록 안됨):
            // - SecurityAnalysisAgent (MCP SecurityVulnerabilityTool로 대체)
            // - CodeWatcherAgent, CommentGenerationAgent, GitignoreGenerationAgent
            // - ProgressTrackingAgent, ContextArchiveAgent, AILedLearningAgent

            let finalChosenAgent = 'CodeEditAgent'; // Default to CodeEditAgent for code tasks
            if (parsedRoutingDecision && parsedRoutingDecision.chosen_agent) {
                const chosenAgent = parsedRoutingDecision.chosen_agent;
                
                if (chosenAgent === 'Conversational') {
                    // Handle Conversational routing directly by responding to the user
                    // Instead of using the 'reason' (which is often just a justification in English),
                    // we generate a proper conversational response in the user's language.
                    const userLanguage = vscode.env.language || 'en';
                    const conversationalPrompt = getConversationalPrompt(stepDescription, this.llmConversationHistory, [], userLanguage);
                    
                    this.developerLogService.log(`[OrchestratorAgent] Routing to Conversational. Generating response in ${userLanguage}...`);

                    let responseText = '';
                    try {
                        const convResp = await this.llmService.requestLLMCompletion(
                            provider,
                            [{ role: 'user', content: conversationalPrompt }],
                            apiKeys[0] || '',
                            endpoint,
                            [],
                            model,
                            undefined,
                            timeout
                        );
                        responseText = (convResp.choices?.[0]?.message?.content ?? (convResp as any).choices?.[0]?.text ?? '').toString().trim();
                    } catch (e: any) {
                        this.developerLogService.log(`[OrchestratorAgent] Failed to generate conversational response: ${e.message}`);
                        responseText = parsedRoutingDecision.reason || "I'm sorry, I couldn't generate a response.";
                    }

                    const responseMessage: ChatMessage = {
                        author: 'agent',
                        content: [{ type: 'text', text: responseText }],
                        senderName: OrchestratorAgent.AGENT_ID,
                        timestamp: new Date().toISOString()
                    };
                    await this.addMessageToHistory(responseMessage);
                    this._onDidPostMessage.fire({ command: 'response', payload: { text: responseText, senderName: responseMessage.senderName, timestamp: responseMessage.timestamp } });
                    
                    // Mark current step as completed (or skipped) since we handled it conversationally
                    return; 
                } else if (chosenAgent === 'BrainstormAgent' && !this.autonomousMode) {
                    // BrainstormAgent는 Uroboros Mode에서만 사용
                    this.developerLogService.log(`BrainstormAgent selected by routing LLM but Uroboros Mode is disabled. Falling back to CodeEditAgent.`);
                    finalChosenAgent = 'CodeEditAgent';
                } else if (registeredAgentNames.has(chosenAgent)) {
                    finalChosenAgent = chosenAgent;
                } else {
                    console.warn(`[OrchestratorAgent] LLM chose an unregistered agent: "${chosenAgent}". Falling back to CodeEditAgent.`);
                    this.developerLogService.log(`LLM chose an unregistered agent: "${chosenAgent}". Falling back to CodeEditAgent.`);
                }
            } else {
                // No heuristic fallback; strictly default to CodeEditAgent on invalid or missing routing JSON
                console.warn('[OrchestratorAgent] LLM did not return a valid JSON routing decision. Defaulting to CodeEditAgent.');
                this.developerLogService.log('LLM did not return a valid JSON routing decision. Defaulting to CodeEditAgent.');
            }

            console.log(`[OrchestratorAgent] Final chosen agent: ${finalChosenAgent} for step: ${stepDescription}`);
            this.developerLogService.log(`Final chosen agent: ${finalChosenAgent} for step: ${stepDescription}`);
            // Do not emit routing decision as chat to UI (keep logs only)
            try {
                const reason = (parsedRoutingDecision && parsedRoutingDecision.reason) ? parsedRoutingDecision.reason : '';
                if (reason) { this.developerLogService.log(`Routing reason: ${reason}`); }
            } catch {}

            // Duplicate-dispatch suppression: if the same step was dispatched very recently
            const now = Date.now();
            if (this.lastDispatchedStep === stepDescription && (now - this.lastDispatchedAt) < 8000 && this.lastUserInputAt <= this.lastDispatchedAt) {
                console.warn('[OrchestratorAgent] Suppressing duplicate dispatch without new user input:', stepDescription);
                this.developerLogService.log(`[OrchestratorAgent] Suppressed duplicate dispatch for step: ${stepDescription}`);
                return;
            }

            // LLM-Driven Context Selection (Primary)
            // If the Routing LLM explicitly identified a target file, use it.
            let resolvedFilePath = parsedRoutingDecision?.target_file;
            if (resolvedFilePath) {
                 this.developerLogService.log(`[OrchestratorAgent] LLM Explicitly selected target file: ${resolvedFilePath}`);
            } else {
                 // Fallback: Check if lastUserQuery implies a specific file via strict instruction
                 // But user requested NO keyword parsing. So we skip regex.
                 // We rely purely on the routing LLM to update 'target_file' field.
            }

            // 2. Active File Priority
            // If no explicit file in query (or LLM didn't pick one), check active file.
            if (!resolvedFilePath) {
                const activeFile = this.contextService.getActiveFile();
                if (activeFile) {
                    resolvedFilePath = activeFile;
                    // Update persistence if it changed
                    if (this.lastContextFilePath !== activeFile) {
                        this.lastContextFilePath = activeFile;
                        this.developerLogService.log(`[OrchestratorAgent] Context Switch: Active file priority. Context updated to ${activeFile}`);
                    }
                } else {
                    // 3. No Active File -> Clear Context
                    if (this.lastContextFilePath) {
                        this.developerLogService.log(`[OrchestratorAgent] Context Reset: No active file. Clearing persistent context.`);
                        this.lastContextFilePath = undefined;
                    }
                    // Implicitly, resolvedFilePath remains undefined.
                }
            }
            // 4. Smart Context Swap
            // If context is implicit (Active/History) and points to Test/Artifact,
            // but Agent is Docs/Test/Readme -> Swap to Source.
            // Heuristic: Documents and Tests are usually derived from Source.
            // If user did NOT explicitly specify a file (extractedFilePath is undefined),
            // and we are just following the active focus or history,
            // and that focus/history is a Test or Artifact,
            // and the intended task (Agent) is one that typically targets Source...
            // THEN swap to the last known Source File.
            // 4. Smart Context Swap (Disable per user request: "LLM Prompt로 제어해줘")
            // Rely purely on Routing Prompt to set 'target_file'.






            // Smart Context Resolution:
            // If we extracted a relative filename (e.g. "dfs.py") and we have a lastContextFilePath (e.g. "/abs/path/to/dfs.py")
            // that matches the filename, prefer the absolute path from context.
            if (resolvedFilePath && !path.isAbsolute(resolvedFilePath) && this.lastContextFilePath) {
                const extractedName = path.basename(resolvedFilePath);
                const contextName = path.basename(this.lastContextFilePath);
                if (extractedName.toLowerCase() === contextName.toLowerCase()) {
                    this.developerLogService.log(`[OrchestratorAgent] Using lastContextFilePath (${this.lastContextFilePath}) instead of resolving ${resolvedFilePath} against root.`);
                    resolvedFilePath = this.lastContextFilePath;
                } else {
                    // Smart Context Resolution v2: Try resolving against the directory of the last context file
                    try {
                        const contextDir = path.dirname(this.lastContextFilePath);
                        const candidate = path.join(contextDir, resolvedFilePath);
                        // If lastContextFilePath is outside workspace, we prefer its dir.
                        const ws = vscode.workspace.workspaceFolders;
                        const root = ws?.[0]?.uri?.fsPath || '';
                        if (root && !this.lastContextFilePath.startsWith(root)) {
                             resolvedFilePath = candidate;
                             this.developerLogService.log(`[OrchestratorAgent] Resolving ${extractedName} against external context dir: ${contextDir} -> ${resolvedFilePath}`);
                        }
                    } catch {}
                }
            }
            // Fallback: use active editor file from ContextService
            if (!resolvedFilePath) {
                const activeFile = this.contextService.getActiveFile() || '';
                resolvedFilePath = activeFile;

                // Smart Context Switching (Heuristic):
                // If the active file is a test or documentation file, and the user didn't specify a file,
                // try to find the corresponding source file.
                // This is a safety net for when the LLM routing didn't explicitly pick a file.
                if (activeFile && (activeFile.includes('test') || activeFile.includes('docs') || activeFile.endsWith('.md'))) {
                    try {
                        const baseName = path.basename(activeFile);
                        // e.g. test_dfs.py -> dfs.py, test_dfs.md -> dfs.py
                        const sourceNameCandidate = baseName.replace(/^test_/, '').replace(/^docs_/, '').replace(/\.md$/, '.py').replace(/\.test\./, '.');
                        
                        if (sourceNameCandidate !== baseName) {
                            const dir = path.dirname(activeFile);
                            // Check same dir
                            const candidate1 = path.join(dir, sourceNameCandidate);
                            // Check parent dir (common for docs/test structure)
                            const candidate2 = path.join(path.dirname(dir), sourceNameCandidate);
                            // Check src dir
                            const candidate3 = path.join(path.dirname(dir), 'src', sourceNameCandidate);

                            // We can't synchronously check file existence easily here without fs, 
                            // but we can check if it matches a known pattern or just suggest it if the task implies code analysis.
                            // For now, let's rely on the fact that if the user asked for "analysis" and we are in a doc, we probably want the code.
                            // But blindly switching might be bad if the user DOES want to analyze the test.
                            
                            // Let's only switch if the task description strongly implies "source code" or "implementation"
                            // and NOT "test" or "documentation".
                            // LLM-based decision to avoid keyword hardcoding
                            const shouldSwitch = await this.shouldSwitchContextWithLLM(this.lastUserQuery || '', activeFile, sourceNameCandidate);
                            
                            if (shouldSwitch) {
                                    
                                // Try to resolve via workspace search (best effort)
                                // Since we can't search here easily, we will just log a suggestion or swap if we are confident.
                                // Let's swap to candidate2 (parent dir) or candidate1 (same dir) if it looks like a source file name.
                                if (sourceNameCandidate.endsWith('.py') || sourceNameCandidate.endsWith('.ts') || sourceNameCandidate.endsWith('.js')) {
                                    this.developerLogService.log(`[OrchestratorAgent] Context Switch: Active file is test/doc (${activeFile}), but task implies source analysis. Switching context to: ${sourceNameCandidate}`);
                                    // Prefer candidate1 (same dir) if it exists? We can't check.
                                    // But usually test_dfs.py is in same dir as dfs.py or in tests/.
                                    // If activeFile is d:\...\test_dfs.py, candidate1 is d:\...\dfs.py.
                                    resolvedFilePath = candidate1;
                                    
                                    // PERSISTENCE FIX: Update lastContextFilePath so subsequent steps use this new context
                                    this.lastContextFilePath = resolvedFilePath;
                                    this.developerLogService.log(`[OrchestratorAgent] Persisted new context: ${this.lastContextFilePath}`);
                                }
                            }
                        }
                    } catch {}
                }
            }


            // BUT: If the agent is CodeAnalysisAgent or others that might need absolute paths, we should be careful.
            // Actually, for consistency, we should generally prefer absolute paths internally if available,
            // or at least ensure that if we have an absolute path, we don't break it by making it relative
            // if the agent expects absolute.
            // However, the issue reported is that CodeAnalysisAgent received "test_dfs.py" (relative)
            // when it should have received the full path.
            // The logic below forces relative path if it's within the workspace.
            // We will CHANGE this to keep it absolute if it was already absolute,
            // OR only normalize for display purposes, but pass the absolute path in the payload.
            
            // Current logic:
            // if (resolvedFilePath && path.isAbsolute(resolvedFilePath)) {
            //     const wsFolders = vscode.workspace.workspaceFolders;
            //     if (wsFolders && wsFolders.length > 0) {
            //         const root = wsFolders[0].uri.fsPath;
            //         const rel = path.relative(root, resolvedFilePath);
            //         if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
            //             resolvedFilePath = rel;
            //             try { console.log(`[OrchestratorAgent] Normalized path to relative: ${resolvedFilePath}`); } catch {}
            //         }
            //     }
            // }

            // NEW LOGIC: Do NOT force relative path. Keep it absolute.
            // Most agents (CodeEdit, CodeAnalysis) work better with absolute paths or can handle them.
            // Relative paths are ambiguous without a clear root.
            // We will only log the relative path for debugging but keep resolvedFilePath absolute.
            if (resolvedFilePath && path.isAbsolute(resolvedFilePath)) {
                const wsFolders = vscode.workspace.workspaceFolders;
                if (wsFolders && wsFolders.length > 0) {
                    const root = wsFolders[0].uri.fsPath;
                    const rel = path.relative(root, resolvedFilePath);
                    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
                         // Just log it, don't change resolvedFilePath
                        try { console.log(`[OrchestratorAgent] Path is inside workspace: ${rel} (keeping absolute: ${resolvedFilePath})`); } catch {}
                    }
                }
            }

            try { console.log(`[OrchestratorAgent] routeAndDelegate resolvedFilePath: "${resolvedFilePath}" (extracted="${extractedFilePath}", lastContext="${this.lastContextFilePath}", active="${this.contextService.getActiveFile()}")`); } catch {}
            // Log absolute path check
            if (resolvedFilePath && !path.isAbsolute(resolvedFilePath)) {
                try { console.log(`[OrchestratorAgent] WARNING: resolvedFilePath is RELATIVE: ${resolvedFilePath}. This may cause issues for agents expecting absolute paths.`); } catch {}
                
                // Try to resolve it to absolute if it's relative
                if (this.lastContextFilePath && path.dirname(this.lastContextFilePath)) {
                     try {
                        const absCandidate = path.resolve(path.dirname(this.lastContextFilePath), resolvedFilePath);
                        if (await fs.stat(absCandidate).then(() => true).catch(() => false)) {
                            resolvedFilePath = absCandidate;
                            console.log(`[OrchestratorAgent] Auto-resolved relative path to absolute: ${resolvedFilePath}`);
                        }
                     } catch {}
                }
                if (resolvedFilePath && !path.isAbsolute(resolvedFilePath)) {
                    const wsFolders = vscode.workspace.workspaceFolders;
                    if (wsFolders && wsFolders.length > 0) {
                        const root = wsFolders[0].uri.fsPath;
                        const absCandidate = path.join(root, resolvedFilePath);
                         // We don't check existence here strictly, just assume workspace root
                        resolvedFilePath = absCandidate;
                        console.log(`[OrchestratorAgent] Auto-resolved relative path to workspace root: ${resolvedFilePath}`);
                    }
                }
            }

            // Validate TestGenerationAgent: requires filePath
            // SDK Standard: TestGenerationAgent should be able to handle workspace-wide tests or infer context
            // if (finalChosenAgent === AgentNames.TEST_GENERATION && !resolvedFilePath) {
            
            // Passive Tracking via ContextService (Spotlight Model)
            if (resolvedFilePath && path.isAbsolute(resolvedFilePath)) {
                this.contextService.updateFocus(resolvedFilePath);
                
                // Sync legacy tracking for backward compatibility (if needed)
                const state = this.contextService.getContextState();
                if (state.primarySource && this.lastSourceFilePath !== state.primarySource) {
                    this.lastSourceFilePath = state.primarySource;
                    this.developerLogService.log(`[OrchestratorAgent] Context Spotlight Moved: Source=${this.lastSourceFilePath}, Active=${state.activeFocus}`);
                    await this.state.update(OrchestratorAgent.LAST_SOURCE_FILE_KEY, this.lastSourceFilePath);
                }
            }
            //     console.warn(`[OrchestratorAgent] TestGenerationAgent requires filePath but none found. Falling back to CodeEditAgent.`);
            //     this.developerLogService.log(`TestGenerationAgent requires filePath but none found for step: "${stepDescription}". Falling back to CodeEditAgent.`);
            //     finalChosenAgent = AgentNames.CODE_EDIT;
            // }

            // SDK Standard: Plan이 없는 경우 (direct dispatch) 새로운 correlation 생성
            // 이전 요청의 correlation과 충돌하지 않도록 새로운 planId와 executionId 사용
            if (this.currentPlan.length === 0) {
                if (!this.planId) { this.planId = uuidv4(); }
                if (!this.currentExecutionId) { this.currentExecutionId = uuidv4(); }
                // 새로운 요청이므로 handledExecutions 초기화 (이전 요청의 executionId와 충돌 방지)
                this.handledExecutions.clear();
            }

            // Correlation payload for idempotency (include MAF-style aliases) and sticky session routing
            const stepId = (this.currentStepIndex >= 0 && this.currentStepIndex < this.currentPlan.length) ? this.currentPlan[this.currentStepIndex].id : '';
            const correlation = { planId: this.planId, workflowId: this.planId, stepId, executionId: this.currentExecutionId, runId: this.currentExecutionId, sessionId: this.activeSessionId } as any;

            // Special handling for BrainstormAgent
            if (finalChosenAgent === AgentNames.BRAINSTORM) {
                // Always allow BrainstormAgent when explicitly selected by the routing LLM
                // The routing decision already considered whether brainstorming is needed
                if (!this.brainstormContextId) { this.brainstormContextId = uuidv4(); }
            }

            // Prepare standard A2A Message for all agents
            const filePath = resolvedFilePath;

            // SDK Standard: For BrainstormAgent, task is the original user query, not the step description
            const taskText = finalChosenAgent === AgentNames.BRAINSTORM && this.lastUserQuery
                ? this.lastUserQuery  // Original user query is the task
                : stepDescription;     // For other agents, step description is the task

            // SDK Standard: Pass all artifacts created/updated in the current plan as context
            const contextFiles = Array.from(this.producedArtifacts.keys());

            const standardMessage: A2AMessage<any> = {
                kind: 'message',
                messageId: uuidv4(),
                timestamp: new Date().toISOString(),
                contextId: finalChosenAgent === AgentNames.BRAINSTORM ? this.brainstormContextId : undefined,
                recipient: finalChosenAgent,  // Internal: Used by dispatch() for routing, not SDK standard
                parts: [
                    { kind: 'text', text: taskText },  // SDK Standard: parts[0].text = task (primary)
                    { kind: 'data', mimeType: 'application/vnd.a2a+json', data: {
                        task: taskText,           // SDK Standard: explicit task (duplicate for clarity)
                        query: stepDescription,   // Internal plan step for reference
                        filePath: resolvedFilePath, // Explicit assignment
                        contextFiles,             // <--- NEW: Pass all plan artifacts
                        correlation
                    }}
                ]
            } as any;

            if (finalChosenAgent === AgentNames.TEST_GENERATION) {
                try {
                    console.log(`[OrchestratorAgent] Dispatching to TestGenerationAgent. resolvedFilePath="${resolvedFilePath}"`);
                    if (!resolvedFilePath) {
                        console.warn(`[OrchestratorAgent] WARNING: Dispatching to TestGenerationAgent without filePath!`);
                    }
                    console.log(`[OrchestratorAgent] standardMessage preview: ${JSON.stringify(standardMessage)}`);
                } catch {}
            }

            await this.dispatch(standardMessage);
            try { console.log(`[OrchestratorAgent] Dispatched to ${finalChosenAgent} (standard A2A)${filePath ? ` with filePath=${filePath}` : ''}`); } catch {}
            // BrainstormAgent stays interactive with the user; no auto-complete fallback

            // Record last dispatch info
            this.lastDispatchedStep = stepDescription;
            this.lastDispatchedAt = Date.now();
        } catch (error: any) {
            console.error('Error routing request via LLM:', error);
            this.developerLogService.log(`ERROR: ${AgentMessages.orchestrator.routeFailed} ${error.message}`);

            // Mark current step as error
            const currentStepIndex = this.currentPlan.findIndex(step => step.status === 'in-progress');
            if (currentStepIndex !== -1) {
                this.currentPlan[currentStepIndex].status = 'error';
                this._onDidPostMessage.fire({ command: 'updatePlanStep', payload: { index: currentStepIndex, status: 'error' } });
            }

            // Send error message to user
            const errorMessage: ChatMessage = {
                author: 'agent',
                content: [{ type: 'text', text: `${AgentMessages.orchestrator.stepExecutionFailed}${error.message || AgentMessages.orchestrator.unknownError}` }],
                senderName: OrchestratorAgent.AGENT_ID,
                timestamp: new Date().toISOString()
            };
            await this.addMessageToHistory(errorMessage);
            this._onDidPostMessage.fire({ command: 'response', payload: { text: errorMessage.content[0].text, senderName: errorMessage.senderName, timestamp: errorMessage.timestamp } });

            // Try to continue with next step or finish plan
            const nextStepIndex = this.currentPlan.findIndex(step => step.status === 'pending');
            if (nextStepIndex !== -1) {
                // Continue with next step
                this.developerLogService.log(`Continuing to next step after routing error.`);
                await this.executePlan();
            } else {
                // No more steps, finish plan
                const hasErrors = this.currentPlan.some(step => step.status === 'error');
                const statusText = hasErrors ? AgentMessages.orchestrator.planFinishedErrors : AgentMessages.orchestrator.planFinished;
                this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: statusText } });
                this.parseAndSendFinalResponse(hasErrors ? AgentMessages.orchestrator.planCompletedErrors : AgentMessages.orchestrator.planCompletedSuccess);
                this.currentPlan = [];
            }
        }
    }

    private addMessageToHistory(message: ChatMessage): void {
        // Deduplicate based on messageId if available
        if (message.messageId) {
            const exists = this.chatHistory.some(m => m.messageId === message.messageId);
            if (exists) {
                console.log(`[OrchestratorAgent] Skipping duplicate message with ID ${message.messageId}`);
                return;
            }
        }
        
        // Prevent adjacent duplicate user messages (content check fallback)
        if (message.author === 'user' && this.chatHistory.length > 0) {
            const lastMsg = this.chatHistory[this.chatHistory.length - 1];
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
        
        this.chatHistory.push(message);
        this.saveCurrentChatHistory();

        // SDK Standard: chatHistory와 llmConversationHistory 동기화
        // agent 메시지도 llmConversationHistory에 추가하여 LLM 프롬프트에 포함되도록 함
        try {
            if (message.author === 'user') {
                // User 메시지는 이미 handleChatAndSpecialistCommands에서 추가되므로 여기서는 스킵
                // 단, newChat의 initialQuery 등 직접 호출되는 경우를 위해 추가
                const text = Array.isArray(message.content)
                    ? message.content.map((c: any) => typeof c === 'string' ? c : (c?.text ?? '')).filter(Boolean).join(' ')
                    : (typeof (message as any).text === 'string' ? (message as any).text : '');
                if (text && !this.llmConversationHistory.some(m => m.role === 'user' && m.content === text)) {
                    this.llmConversationHistory.push({ role: 'user', content: text });
                    this.saveCurrentLlmHistory();
                }
            } else if (message.author === 'agent') {
                // Agent 메시지를 llmConversationHistory에 추가 (role: 'assistant')
                const text = Array.isArray(message.content)
                    ? message.content.map((c: any) => typeof c === 'string' ? c : (c?.text ?? '')).filter(Boolean).join(' ')
                    : (typeof (message as any).text === 'string' ? (message as any).text : '');
                if (text) {
                    // 중복 방지: 마지막 메시지가 같은 내용이면 스킵 (LLM 응답 후 수동 추가와의 중복 방지)
                    const lastMsg = this.llmConversationHistory[this.llmConversationHistory.length - 1];
                    if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.content !== text) {
                        this.llmConversationHistory.push({ role: 'assistant', content: text });
                        this.pruneLlmHistoryIfNeeded();
                        this.saveCurrentLlmHistory();
                    }
                }
            }
        } catch (e) {
            console.warn('[OrchestratorAgent] Failed to sync message to llmConversationHistory:', e);
        }

        try {
            // Update sessions index: increment messageCount, and set a summary-based title on first user message
            const sessions = this.state.get<any[]>(OrchestratorAgent.SESSIONS_INDEX_KEY, []) || [];
            const activeId = this.state.get<string>(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, this.activeSessionId || '');
            const idx = sessions.findIndex(s => s.id === activeId);
            if (idx >= 0) {
                const meta = { ...sessions[idx] };
                meta.messageCount = (meta.messageCount || 0) + 1;
                let shouldDeriveTitle = false;
                if (message.author === 'user') { shouldDeriveTitle = true; }
                else if (message.author === 'agent') { shouldDeriveTitle = true; }
                if (shouldDeriveTitle) {
                    let text = '';
                    if (Array.isArray(message.content)) {
                        text = message.content
                            .map((c: any) => typeof c === 'string' ? c : (c?.text ?? ''))
                            .filter(Boolean)
                            .join(' ');
                    } else if (typeof (message as any).text === 'string') {
                        text = (message as any).text;
                    }
                    const firstLine = (text || '').split(/\r?\n/)[0].trim();
                    if (firstLine) {
                        const maxLen = 60;
                        const summary = firstLine.length > maxLen ? firstLine.slice(0, maxLen - 1) + '…' : firstLine;
                        meta.title = summary;
                    }
                }
                sessions[idx] = meta;
                const thenable = this.state.update(OrchestratorAgent.SESSIONS_INDEX_KEY, sessions);
                try { (thenable as any)?.then?.(() => this._onDidPostMessage.fire({ command: 'historyList', payload: { sessions, activeId } })); } catch {}
            }
        } catch {}

        // Opportunistically refresh session title with AI summarization
        try {
            (async () => { try { await this.updateSessionTitleSummary(); } catch {} })();
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

    private async saveCurrentChatHistory(): Promise<void> {
        if (this.activeSessionId) { // Use class member
            await this.state.update(this.getSessionChatHistoryKey(this.activeSessionId), this.chatHistory);
        }
    }

    private async saveCurrentLlmHistory(): Promise<void> {
        if (this.activeSessionId) { // Use class member
            await this.state.update(this.getSessionLlmHistoryKey(this.activeSessionId), this.llmConversationHistory);
        }
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
    private async sendDirectActionSummary(filePath: string, senderName: string): Promise<void> {
        try {
            const artifacts = Array.from(this.producedArtifacts.entries());
            const ws = vscode.workspace.workspaceFolders;
            const root = ws?.[0]?.uri?.fsPath || '';
            const artifactsList = artifacts.map(([absOrRel, kind]) => {
                const abs = path.isAbsolute(absOrRel) ? absOrRel : (root ? path.resolve(root, absOrRel) : absOrRel);
                const rel = root ? path.relative(root, abs) : abs;
                const link = `file://${abs.replace(/\\/g, '/')}`;
                return { kind, abs, rel, link };
            });

            const langCodeRaw = (vscode.env.language || 'en').toLowerCase();
            const baseLangCode = (langCodeRaw.split('-')[0] || langCodeRaw);
            const sys = `You are interacting with a user whose VS Code UI language code is "${langCodeRaw}". Always respond in the natural language corresponding to this code (base language "${baseLangCode}").

Using the structured data provided:
1. Write a concise, natural summary of what was accomplished (file created/updated).
2. Based on the artifact (created/updated file), suggest 2-3 relevant follow-up tasks that would be valuable next steps (e.g., testing, documentation, refactoring, optimization).
3. List each follow-up task as a numbered item.
4. End with a polite question asking whether to proceed with those follow-up tasks (do not include example answers).
5. At the very end, provide a single line starting with "NEXT_ACTION_SUGGESTION:" followed by a concise next action suggestion in ENGLISH.

Format your response as:
- Summary of what was accomplished
- Follow-up suggestions (numbered list)
- Question to user
- NEXT_ACTION_SUGGESTION: [English suggestion]`;

            const data = {
                header: 'Action completed successfully.',
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
                    timeout
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
                lines.push('# Action Summary');
                lines.push('Action completed successfully.');
                lines.push('');
                if (artifactsList.length > 0) {
                    lines.push('## Artifacts');
                    for (const a of artifactsList) {
                        lines.push(`- [${a.kind}] [${a.rel}](${a.link})`);
                    }
                }
                summary = lines.join('\n');
            }

            const historyMessage: ChatMessage = {
                author: 'agent',
                content: [{ type: 'text', text: summary }],
                senderName: OrchestratorAgent.AGENT_ID,
                timestamp: new Date().toISOString()
            } as any;
            (historyMessage as any).requiresUserInput = extractedFollowUps.length > 0;
            await this.addMessageToHistory(historyMessage);

            // When follow-ups exist (extracted from LLM response), set awaiting confirmation
            if (extractedFollowUps.length > 0) {
                this.pendingPostActions = extractedFollowUps;
                this.isAwaitingPostActionsConfirmation = true;
            }

            // Log a concise summary line to the progress log
            const logLine = `Action completed successfully. (followUps=${extractedFollowUps.length})`;
            this._onDidPostMessage.fire({ command: 'progressLog', payload: { text: logLine } });

            // DO NOT send responseStart/responseEnd here - it will overwrite createFileCard messages
            // Instead, use the response command which adds a new message without affecting existing ones
            this._onDidPostMessage.fire({
                command: 'response',
                payload: {
                    text: summary,
                    senderName: historyMessage.senderName,
                    timestamp: historyMessage.timestamp,
                    requiresUserInput: extractedFollowUps.length > 0,
                    nextActionSuggestion
                }
            });

            this.llmConversationHistory.push({ role: 'assistant', content: summary });
            await this.saveCurrentChatHistory();
            await this.saveCurrentLlmHistory();
            await this.updateSessionTitleSummary?.();
        } catch (e) {
            this.developerLogService.log(`[OrchestratorAgent] Failed to send direct action summary: ${e}`);
        }
    }

    // SDK Standard: LLM generates follow-up actions via prompt, not hardcoded
    private buildDynamicPostActionsFromArtifacts(): string[] {
        return [];
    }

    private async runLintForFile(filePath: string): Promise<void> {
		try {
			const ws = vscode.workspace.workspaceFolders;
			const root = ws?.[0]?.uri?.fsPath || '';
			let target = filePath;
			if (root) {
				const abs = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
				const rel = path.relative(root, abs) || abs;
				target = rel.replace(/\\/g, '/');
			}
			const mcpClient = getMcpClient();
			const res: any = await (mcpClient as any).callTool({ name: 'LintTool', arguments: { paths: [target], fix: false } });
			const sc = (res as any)?.structuredContent || {};
			const errorCount = typeof sc.errorCount === 'number' ? sc.errorCount : 0;
			const warningCount = typeof sc.warningCount === 'number' ? sc.warningCount : 0;
			const fileLabel = path.basename(filePath);
			const summary = `${fileLabel} – ${errorCount} lint errors (${warningCount} warnings)`;
			this._onDidPostMessage.fire({ command: 'progressLog', payload: { text: summary } });
			this._onDidPostMessage.fire({ command: 'lintSummary', payload: { filePath, summary } });
		} catch (e: any) {
			try { this.developerLogService.log(`[OrchestratorAgent] LintTool failed for ${filePath}: ${e?.message || e}`); } catch {}
		}
	}

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

	private updateDiagnostics(filePath: string, issues: any[]): void {
		// Implementation unchanged
	}

	// --- Helper: Robustly extract a JSON string array plan from arbitrary text ---
	private extractPlanArray(text: string): string[] | null {
        if (!text) { return null; }
        let candidate = text.trim();
        try {
            // 1) Direct JSON parse if starts with '['
            if (/^\s*\[/.test(candidate)) {
                const parsed = JSON.parse(candidate);
                if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(x => typeof x === 'string')) { return parsed as string[]; }
            }
        } catch {}
        // 2) Extract first JSON array anywhere
        try {
            const arrayMatch = candidate.match(/(\[[\s\S]*?\])/m);
            if (arrayMatch && arrayMatch[1]) {
                const parsed = JSON.parse(arrayMatch[1]);
                if (Array.isArray(parsed) && parsed.length > 0) { return parsed as string[]; }
            }
        } catch {}
        // 3) Extract from ```json code block
        try {
            const cb = candidate.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
            if (cb && cb[1]) {
                const parsed = JSON.parse(cb[1].trim());
                if (Array.isArray(parsed) && parsed.length > 0) { return parsed as string[]; }
            }
        } catch {}
        // 4) Fallback: bullet/numbered lines to array
        try {
            const lines = candidate
                .replace(/<\/?DIRECT_RESPONSE>/gi, '')
                .replace(/<\|[^>]+\|>/g, '')
                .split(/\r?\n/) // split to lines
                .map(l => l.trim())
                .filter(l => !!l);
            // Keep lines that look like steps: - foo, 1. bar, * baz
            const steps = lines
                .map(l => l.replace(/^[-*]\s+/, '').replace(/^\d+\.?\s+/, '').trim())
                .filter(l => l.length > 0);
            if (steps.length > 0) { return steps; }
        } catch {}
        return null;
    }

    /**
     * Send update-task command to TaskDecompositionAgent to update TASK.md checkbox
     */
    private async updateTaskMd(stepIndex: number, stepDescription: string): Promise<void> {
        try {
            // TaskDecompositionAgent update is handled via A2A message routing
        } catch (e: any) {
            this.developerLogService.log(`Error updating TASK.md: ${e?.message || e}`);
        }
    }

    /**
     * Handle info_query intent: Use MCP tools directly to provide information without creating code
     */
    private async handleInfoQuery(userText: string, classification: { complexity_score?: number; affected_scope?: string; complexity_reasons?: string[] }, sessionId: string): Promise<void> {
        try {
            const mcpClient = getMcpClient();
            const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
            const apiKeys = await this.configService.getApiKeys();
            const endpoint = this.configService.getEndpoint();
            const provider = this.configService.getLlmProvider();

            console.log(`[OrchestratorAgent] Processing info_query: ${userText}`);
            this.developerLogService.log(`[OrchestratorAgent] Processing info_query: ${userText}`);

            // Step 1: Use ListDirTool to get directory listing to provide context
            let dirList: any = null;

            // For info_query, always try to get directory listing to provide context
            // LLM will decide whether to use this information based on the query
            try {
                const ws = vscode.workspace.workspaceFolders;
                const workspaceRoot = ws?.[0]?.uri?.fsPath || '';
                console.log(`[OrchestratorAgent] Calling ListDirTool with dirPath: '.', workspace root: ${workspaceRoot}`);

                dirList = await mcpClient.callTool({
                    name: 'ListDirTool',
                    arguments: {
                        dirPath: '.',
                        recursive: false,
                        limit: 100,
                        sortBy: 'name',
                        order: 'asc'
                    }
                });

                console.log(`[OrchestratorAgent] ListDirTool response:`, JSON.stringify(dirList, null, 2));
                // ListDirTool 응답 구조: {content: [...], structuredContent: {entries: [...]}}
                const entries = dirList?.structuredContent?.entries || dirList?.entries || [];
                console.log(`[OrchestratorAgent] ListDirTool returned ${entries.length} entries`);
                this.developerLogService.log(`[OrchestratorAgent] ListDirTool returned ${entries.length} entries`);

                if (entries && Array.isArray(entries) && entries.length > 0) {
                    console.log(`[OrchestratorAgent] Sample entries:`, entries.slice(0, 5).map((e: any) => ({ name: e.name, type: e.type, path: e.path })));
                }
            } catch (e: any) {
                // If ListDirTool fails, continue without directory listing
                console.error(`[OrchestratorAgent] ListDirTool failed:`, e);
                this.developerLogService.log(`[OrchestratorAgent] ListDirTool failed (non-critical): ${e?.message || e}`);
            }

            // Step 2: Build context with MCP tool results (directory listing only)
            let contextInfo = '';
            // ListDirTool 응답 구조: {content: [...], structuredContent: {entries: [...]}}
            const entries = dirList?.structuredContent?.entries || dirList?.entries || [];
            if (entries && Array.isArray(entries) && entries.length > 0) {
                const files = entries.filter((e: any) => e.type === 'file').map((e: any) => e.name);
                const dirs = entries.filter((e: any) => e.type === 'dir').map((e: any) => e.name);
                contextInfo = `\n\nCurrent Directory Contents:\nFiles: ${files.join(', ')}${dirs.length > 0 ? `\nDirectories: ${dirs.join(', ')}` : ''}`;
                console.log(`[OrchestratorAgent] Built contextInfo with ${files.length} files, ${dirs.length} dirs`);
            } else {
                console.warn(`[OrchestratorAgent] WARNING: No directory listing available. dirList:`, dirList);
                this.developerLogService.log(`[OrchestratorAgent] WARNING: No directory listing available for info_query`);
                contextInfo = `\n\nNote: Directory listing is currently unavailable. Please provide information based on general knowledge.`;
            }

            // Step 3: Generate response using LLM with context
            const langCodeRaw = (vscode.env.language || 'en').toLowerCase();
            const baseLangCode = (langCodeRaw.split('-')[0] || langCodeRaw);
            const localeSystem = `You are interacting with a user whose VS Code UI language code is "${langCodeRaw}". Always respond in the natural language corresponding to this code (base language "${baseLangCode}").`;

            const infoPrompt = `System: You are Viper, an expert coding partner. The user is asking for information about their codebase or workspace.

Rules:
- Use the provided directory/file information to answer the user's question directly
- Do NOT propose to create any files or write any code
- If you need to read file contents, use the FileReadTool MCP tool that is available to you
- Provide a clear, concise summary or explanation based on the available information
- If directory information is provided, use it to give an accurate overview
- **CRITICAL**: If directory information is provided, you MUST use it. Do NOT make up or guess file names.

User Request: "${userText}"${contextInfo}

Provide a helpful response based on the information available. Use FileReadTool if you need to read file contents.`;

            const convTimeout = Math.min(Math.max(10000, this.configService.getRequestTimeout(OrchestratorAgent.AGENT_ID) || 60000), 30000);
            const streaming = this.configService.isStreamingEnabled(OrchestratorAgent.AGENT_ID);

            console.log(`[OrchestratorAgent] Sending info_query to LLM with contextInfo length: ${contextInfo.length}`);
            console.log(`[OrchestratorAgent] Full prompt preview:`, infoPrompt.substring(0, 500));

            // MCP SDK Standard: Dynamically fetch tools from MCP server (including external MCP servers)
            let tools: any[] = [];
            try {
                const mcpClientAny = mcpClient as any;
                if (typeof mcpClientAny.listTools === 'function') {
                    const toolsList = await mcpClientAny.listTools();
                    if (toolsList?.tools && Array.isArray(toolsList.tools)) {
                        // MCP tool을 OpenAI-style function format으로 변환
                        tools = toolsList.tools.map((tool: any) => {
                            // MCP SDK Standard: inputSchema는 이미 JSON Schema 형식
                            const inputSchema = tool.inputSchema || {};
                            const properties: any = {};
                            const required: string[] = [];

                            // JSON Schema에서 properties와 required 추출
                            if (inputSchema.properties && typeof inputSchema.properties === 'object') {
                                for (const [key, value] of Object.entries(inputSchema.properties)) {
                                    properties[key] = value;
                                }
                            }
                            if (Array.isArray(inputSchema.required)) {
                                required.push(...inputSchema.required);
                            }

                            return {
                                type: 'function',
                                function: {
                                    name: tool.name,
                                    description: tool.description || tool.title || '',
                                    parameters: {
                                        type: 'object',
                                        properties,
                                        required: required.length > 0 ? required : undefined,
                                        additionalProperties: false
                                    }
                                }
                            };
                        });
                        console.log(`[OrchestratorAgent] Loaded ${tools.length} tools from MCP server (including external MCP servers)`);
                        this.developerLogService.log(`[OrchestratorAgent] Available tools: ${tools.map((t: any) => t.function.name).join(', ')}`);
                    }
                }
            } catch (e: any) {
                console.warn(`[OrchestratorAgent] Failed to get tools from MCP, using getCoreLLMTools:`, e?.message || e);
                this.developerLogService.log(`[OrchestratorAgent] MCP tools fetch failed: ${e?.message || e}`);
                tools = getCoreLLMTools(provider); // Fallback
            }

            if (tools.length === 0) {
                tools = getCoreLLMTools(provider); // Final fallback
            }

            // MCP SDK Standard: Tool calling loop
            const messages: LlmMessage[] = [{ role: 'system', content: localeSystem }, { role: 'user', content: infoPrompt }];
            let maxIterations = 5; // Prevent infinite loops
            let finalResponse = '';

            while (maxIterations-- > 0) {
                const response = await this.llmService.requestLLMCompletion(
                    provider,
                    messages,
                    apiKeys[0] || '',
                    endpoint,
                    tools,
                    model,
                    streaming ? (chunk: string) => {
                        this.postMessageToSession(sessionId, 'responseChunk', { text: chunk });
                    } : undefined,
                    convTimeout
                );

                const assistantMessage = response.choices?.[0]?.message;
                if (!assistantMessage) {
                    break;
                }

                messages.push(assistantMessage);

                // Check if LLM wants to call tools
                const toolCalls = assistantMessage.tool_calls;
                if (!toolCalls || toolCalls.length === 0) {
                    // No more tool calls, this is the final response
                    finalResponse = (assistantMessage.content ?? '').toString().trim();
                    break;
                }

                // Execute tool calls
                const toolResults: LlmMessage[] = [];
                for (const toolCall of toolCalls) {
                    try {
                        const toolName = toolCall.function?.name;
                        let toolArgs: any;
                        const rawArgs = toolCall.function?.arguments;
                        if (typeof rawArgs === 'string') {
                            try {
                                toolArgs = JSON.parse(rawArgs || '{}');
                            } catch {
                                toolArgs = {};
                            }
                        } else if (typeof rawArgs === 'object' && rawArgs !== null) {
                            toolArgs = rawArgs;
                        } else {
                            toolArgs = {};
                        }

                        console.log(`[OrchestratorAgent] Executing tool: ${toolName}`, toolArgs);

                        const toolResult = await mcpClient.callTool({
                            name: toolName,
                            arguments: toolArgs
                        } as any);

                        // MCP Tool 응답 구조: {content: [...], structuredContent: payload}
                        const resultContent = (toolResult as any)?.structuredContent
                            ? JSON.stringify((toolResult as any).structuredContent)
                            : ((toolResult as any)?.content?.find?.((b: any) => b?.type === 'text')?.text || JSON.stringify(toolResult));

                        toolResults.push({
                            role: 'tool',
                            content: resultContent,
                            tool_call_id: toolCall.id,
                            name: toolName
                        } as any);
                    } catch (e: any) {
                        console.error(`[OrchestratorAgent] Tool execution failed:`, e);
                        toolResults.push({
                            role: 'tool',
                            content: `Error: ${e?.message || e}`,
                            tool_call_id: toolCall.id,
                            name: toolCall.function?.name
                        } as any);
                    }
                }

                // Add tool results to conversation
                messages.push(...toolResults);
            }

            if (!finalResponse) {
                finalResponse = 'I couldn\'t process that request.';
            }

            const { thought, userFacingText } = this.parseThoughtAndUserFacingText(finalResponse || null);
            const finalText = userFacingText || finalResponse;

            if (streaming) {
                this.postMessageToSession(sessionId, 'responseEnd', { thought: thought || undefined });
            } else {
                // Emulate streaming for consistent UI
                this.postMessageToSession(sessionId, 'responseStart', {});
                this.postMessageToSession(sessionId, 'responseChunk', { text: finalText });
                this.postMessageToSession(sessionId, 'responseEnd', { thought: thought || undefined });
            }

            const agentMessage: ChatMessage = {
                author: 'agent',
                content: [{ type: 'text', text: finalText }],
                thought: thought || undefined,
                senderName: OrchestratorAgent.AGENT_ID,
                timestamp: new Date().toISOString()
            };
            await this.addMessageToHistory(agentMessage);
            this.llmConversationHistory.push({ role: 'assistant', content: finalText });

            await this.saveCurrentChatHistory();
            await this.saveCurrentLlmHistory();
            await this.updateSessionTitleSummary();

        } catch (e: any) {
            console.error('[OrchestratorAgent] Error handling info_query:', e);
            this.developerLogService.log(`ERROR: Failed to handle info_query: ${e?.message || String(e)}`);

            const errorText = `정보를 조회하는 중 오류가 발생했습니다: ${e?.message || '알 수 없는 오류'}`;
            const agentMessage: ChatMessage = {
                author: 'agent',
                content: [{ type: 'text', text: errorText }],
                senderName: OrchestratorAgent.AGENT_ID,
                timestamp: new Date().toISOString()
            };
            await this.addMessageToHistory(agentMessage);
            this._onDidPostMessage.fire({ command: 'response', payload: { text: errorText, senderName: agentMessage.senderName, timestamp: agentMessage.timestamp } });
            await this.saveCurrentChatHistory();
            await this.saveCurrentLlmHistory();
        }
    }
    private async saveStateCheckpoint(): Promise<void> {
        try {
            const state: AgentState = {
                sessionId: this.activeSessionId,
                plan: this.currentPlan.map(step => ({
                    id: step.id,
                    description: step.description,
                    status: step.status as any
                })),
                currentStepIndex: this.currentStepIndex,
                openIssues: [], // TODO: Implement open issues tracking
                lastUpdate: new Date().toISOString()
            };
            await this.checkpointService.saveCheckpoint(state);
        } catch (error) {
            console.error('[OrchestratorAgent] Failed to save checkpoint:', error);
        }
    }


    private async shouldSwitchContextWithLLM(userQuery: string, activeFile: string, candidateFile: string): Promise<boolean> {
        if (!userQuery || !activeFile || !candidateFile) {
            return false;
        }

        const prompt = `
You are a smart coding assistant.
The user is currently viewing a file: "${activeFile}" (likely a test or documentation file).
The user asked: "${userQuery}".
A potential source code file exists: "${candidateFile}".

Determine if the user's request implies modifying or analyzing the SOURCE CODE ("${candidateFile}") instead of the current file ("${activeFile}").
If the user wants to add comments, implement logic, or fix bugs, they usually mean the source code.
If the user wants to run tests or update documentation, they mean the current file.

Reply with ONLY "YES" if we should switch context to "${candidateFile}".
Reply with ONLY "NO" if we should stay on "${activeFile}".
`;

        try {
            const response = await this.llmService.chatCompletion({
                messages: [{ role: 'user', content: prompt }],
                model: 'gpt-4o-mini', // Use a fast, cheap model for this heuristic
                temperature: 0,
                maxTokens: 5
            });

            const answer = response?.choices?.[0]?.message?.content?.trim().toUpperCase();
            this.developerLogService.log(`[OrchestratorAgent] Context Switch LLM Check: ${answer} (Query: "${userQuery}", Active: "${activeFile}")`);
            return answer === 'YES';
        } catch (error) {
            console.error('[OrchestratorAgent] Context Switch LLM Check failed:', error);
            return false;
        }
    }

}
