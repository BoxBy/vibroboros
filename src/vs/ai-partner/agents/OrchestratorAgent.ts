import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { A2AMessage } from '../interfaces/A2AMessage';
import { MCPServer } from '../server/MCPServer';
import { LLMService, LlmMessage } from '../services/LLMService';
import { AuthService } from '../auth_service';
import { ConfigService } from '../config_service';
import { DeveloperLogService } from '../services/DeveloperLogService';
import { CommentGenerationAgent } from './CommentGenerationAgent';

// --- Type Definitions ---
type ChatMessage = { author: 'user' | 'agent', content: any[] };

/**
 * @class OrchestratorAgent
 * @description The master agent that coordinates all other agents and services.
 * It acts as the central hub for the AI Partner, managing the chat lifecycle,
 * session state, UI communication, and the delegation of tasks to specialized agents.
 * This agent is the "brain" of the operation, deciding when to talk to the LLM,
 * when to call a tool, and when to delegate to another agent.
 */
export class OrchestratorAgent {
	private static readonly AGENT_ID = 'OrchestratorAgent';
	private static readonly SESSIONS_INDEX_KEY = 'aiPartnerChatSessionsIndex';
	private static readonly ACTIVE_SESSION_ID_KEY = 'aiPartnerActiveChatSessionId';

	private readonly _onDidPostMessage = new vscode.EventEmitter<any>();

	/**
	 * An event that fires when the agent wants to send a message to the UI (ViewProvider).
	 * The ViewProvider should listen to this event to update the webview's state.
	 * @event
	 */
    public readonly onDidPostMessage = this._onDidPostMessage.event;

	private dispatch: (message: A2AMessage<any>) => Promise<void>;
	private mcpServer: MCPServer;
	private llmService: LLMService;
	private authService: AuthService;
	private configService: ConfigService;
	private state: vscode.Memento;
	private diagnosticCollection: vscode.DiagnosticCollection;
	private developerLogService: DeveloperLogService;
	private commentGenerationAgent: CommentGenerationAgent;
	private chatHistory: ChatMessage[] = [];
	private llmConversationHistory: LlmMessage[] = [];
	private isAutonomousMode: boolean = false;
    private lastPromptTokenCount: number = 0;
    private currentPlan: { description: string; status: string; }[] = [];

    /**
     * Creates an instance of the OrchestratorAgent.
     * @param dispatch Function to send messages to other agents.
     * @param mcpServer The Master Control Program server for handling tool calls.
     * @param llmService Service for communicating with the Large Language Model.
     * @param authService Service for managing user authentication.
     * @param configService Service for accessing extension configuration.
     * @param state VS Code extension state for persistence.
     * @param diagnosticCollection Collection for displaying code diagnostics (e.g., linting issues).
     * @param developerLogService Service for logging internal agent activities.
     */
	constructor(
		dispatch: (message: A2AMessage<any>) => Promise<void>,
		mcpServer: MCPServer,
		llmService: LLMService,
		authService: AuthService,
		configService: ConfigService,
		state: vscode.Memento,
		diagnosticCollection: vscode.DiagnosticCollection,
		developerLogService: DeveloperLogService
	) {
		this.dispatch = dispatch;
		this.mcpServer = mcpServer;
		this.llmService = llmService;
		this.authService = authService;
		this.configService = configService;
		this.state = state;
		this.diagnosticCollection = diagnosticCollection;
		this.developerLogService = developerLogService;
		this.commentGenerationAgent = new CommentGenerationAgent(this.dispatch.bind(this), this.mcpServer, this.llmService);
		this.loadOrInitializeSession();
	}

	/**
	 * Loads the active chat session from the extension's state, or creates a new one if none exists.
	 * This ensures that the chat history and context are persisted across VS Code sessions.
	 * @private
	 */
	private loadOrInitializeSession(): void {
		let activeId = this.state.get<string>(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, '');
		let sessions = this.state.get<any[]>(OrchestratorAgent.SESSIONS_INDEX_KEY, []) || [];

		if (!activeId || !sessions.find(s => s.id === activeId)) {
			const now = new Date();
			activeId = `session-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
			const meta = { id: activeId, title: `Chat ${now.toLocaleString()}`, createdAt: now.toISOString(), messageCount: 0 };
			sessions.push(meta);
			this.state.update(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, activeId);
			this.state.update(OrchestratorAgent.SESSIONS_INDEX_KEY, sessions);
			this.chatHistory = [];
			this.llmConversationHistory = [];
			this.state.update(this.getSessionChatHistoryKey(activeId), this.chatHistory);
			this.state.update(this.getSessionLlmHistoryKey(activeId), this.llmConversationHistory);
		}

		this.chatHistory = this.state.get<ChatMessage[]>(this.getSessionChatHistoryKey(activeId), []);
		this.llmConversationHistory = this.state.get<LlmMessage[]>(this.getSessionLlmHistoryKey(activeId), []);
	}

	/**
	 * Handles a change in the active chat session.
	 * It reloads the relevant history and notifies the UI to update its display.
	 */
    public async handleSessionChange(): Promise<void> {
        await this.sendFullSettingsToUI();
        const sessions = this.state.get<any[]>(OrchestratorAgent.SESSIONS_INDEX_KEY, []) || [];
        const activeId = this.state.get<string>(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, '');
        this._onDidPostMessage.fire({ command: 'historyList', payload: { sessions, activeId } });
        this._onDidPostMessage.fire({ command: 'loadHistory', payload: this.chatHistory });
    }

	/**
	 * Handles incoming messages from the Webview UI, acting as the primary router for user interactions.
	 * This method dispatches actions based on the command received from the UI, such as processing a user query,
	 * changing settings, or managing chat sessions.
	 * @param message The message object from the UI, containing a command and payload.
	 */
    public async handleUIMessage(message: any): Promise<void> {
        console.log(`[${OrchestratorAgent.AGENT_ID}] Received message from ViewProvider:`, message);
        switch (message.command) {
            case 'loadInitialData':
                setTimeout(() => this.sendFullSettingsToUI(), 250);
                break;
            case 'userQuery':
                if (message.query.startsWith('/remember ')) {
                    const memoryText = message.query.substring(10).trim();
                    if (memoryText) {
                        try {
                            const memoryPath = path.join(this.configService.getExtensionPath(), '.agent', 'memory.json');
                            let memories: string[] = [];
                            try {
                                const memoryJson = await fs.readFile(memoryPath, 'utf-8');
                                memories = JSON.parse(memoryJson);
                            } catch (e) {
                                // File might not exist yet, which is fine.
                            }
                            memories.push(memoryText);
                            await fs.writeFile(memoryPath, JSON.stringify(memories, null, 4));
                            
                            const userMessage: ChatMessage = { author: 'user', content: [{ type: 'text', text: message.query }] };
                            const confirmationMessage: ChatMessage = { author: 'agent', content: [{ type: 'text', text: "I will remember that: " + memoryText }] };
                            this.addMessageToHistory(userMessage);
                            this.addMessageToHistory(confirmationMessage);
                            this._onDidPostMessage.fire({ command: 'loadHistory', payload: this.chatHistory });

                        } catch (error) {
                            console.error('Error saving memory:', error);
                            this.handleError(new Error('Could not save memory.'));
                        }
                    }
                    return;
                }
                await this.handleChatAndSpecialistCommands(message.query);
                break;
            case 'setAutonomousMode':
                this.isAutonomousMode = message.enabled;
                this.developerLogService.log(`Autonomous mode set to: ${this.isAutonomousMode}`);
                if (this.llmConversationHistory.length > 0 && this.llmConversationHistory[0].role === 'system') {
                    this.llmConversationHistory[0] = { role: 'system', content: await this.createSystemPrompt() };
                    this.saveCurrentLlmHistory();
                }
                this._onDidPostMessage.fire({ command: 'loopModeChanged', payload: this.isAutonomousMode });
                break;
            case 'requestHistory':
                {
                    const sessions = this.state.get<any[]>(OrchestratorAgent.SESSIONS_INDEX_KEY, []) || [];
                    const activeId = this.state.get<string>(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, '');
                    this._onDidPostMessage.fire({ command: 'historyList', payload: { sessions, activeId } });
                }
                break;
			case 'selectChat':
			{
				const sessionId = message.sessionId as string;
				const activeId = this.state.get<string>(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, '');
				if (sessionId && sessionId !== activeId) {
					await this.state.update(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, sessionId);
					this.chatHistory = this.state.get<ChatMessage[]>(this.getSessionChatHistoryKey(sessionId), []);
					this.llmConversationHistory = this.state.get<LlmMessage[]>(this.getSessionLlmHistoryKey(sessionId), []);
					this._onDidPostMessage.fire({ command: 'loadHistory', payload: this.chatHistory });
				}
			}
				break;
			case 'newChat':
			{
				const now = new Date();
				const sessions = this.state.get<any[]>(OrchestratorAgent.SESSIONS_INDEX_KEY, []) || [];
				const newId = `session-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
				const newMeta = { id: newId, title: `Chat ${now.toLocaleString()}`, createdAt: now.toISOString(), messageCount: 0 };
				sessions.push(newMeta);
				await this.state.update(OrchestratorAgent.SESSIONS_INDEX_KEY, sessions);
				await this.state.update(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, newId);
				this.chatHistory = [];
				this.llmConversationHistory = [];
				await this.state.update(this.getSessionChatHistoryKey(newId), this.chatHistory);
				await this.state.update(this.getSessionLlmHistoryKey(newId), this.llmConversationHistory);
				this._onDidPostMessage.fire({ command: 'historyList', payload: { sessions, activeId: newId } });
				this._onDidPostMessage.fire({ command: 'loadHistory', payload: this.chatHistory });
			}
				break;
			case 'deleteChat':
			{
				const sessionIdToDelete = message.sessionId as string;
				if (!sessionIdToDelete) {break;}

				let sessions = this.state.get<any[]>(OrchestratorAgent.SESSIONS_INDEX_KEY, []) || [];
				let activeId = this.state.get<string>(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, '');
				const remainingSessions = sessions.filter(s => s.id !== sessionIdToDelete);
				this.state.update(this.getSessionChatHistoryKey(sessionIdToDelete), undefined);
				this.state.update(this.getSessionLlmHistoryKey(sessionIdToDelete), undefined);
				if (activeId === sessionIdToDelete) {
					if (remainingSessions.length > 0) {
						activeId = remainingSessions[remainingSessions.length - 1].id;
					} else {
						const now = new Date();
						activeId = `session-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
						const newMeta = { id: activeId, title: `Chat ${now.toLocaleString()}`, createdAt: now.toISOString(), messageCount: 0 };
						remainingSessions.push(newMeta);
						this.chatHistory = [];
						this.llmConversationHistory = [];
						this.state.update(this.getSessionChatHistoryKey(activeId), []);
						this.state.update(this.getSessionLlmHistoryKey(activeId), []);
					}
				}
				this.state.update(OrchestratorAgent.SESSIONS_INDEX_KEY, remainingSessions);
				this.state.update(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, activeId);
				this.chatHistory = this.state.get<ChatMessage[]>(this.getSessionChatHistoryKey(activeId), []);
				this.llmConversationHistory = this.state.get<LlmMessage[]>(this.getSessionLlmHistoryKey(activeId), []);
				this._onDidPostMessage.fire({ command: 'historyList', payload: { sessions: remainingSessions, activeId } });
				this._onDidPostMessage.fire({ command: 'loadHistory', payload: this.chatHistory });
			}
				break;
            default:
                console.warn(`[${OrchestratorAgent.AGENT_ID}] Received unknown command: ${message.command}`);
                break;
        }
    }

	/**
	 * Handles incoming messages from other agents (Agent-to-Agent communication).
	 * This method is the entry point for specialist agents to return their results to the orchestrator.
	 * It processes the results, updates the conversation history, and determines the next step in the plan.
	 * @param message The A2A message from the sending agent, containing the results of its task.
	 */
    public async handleA2AMessage(message: A2AMessage<any>): Promise<void> {
        switch (message.type) {
            case 'response-context':
                const contextPayload = message.payload;
                let searchContextSummary = "";

                if (contextPayload.codebaseSearchResults && contextPayload.codebaseSearchResults.length > 0) {
                    searchContextSummary += `Codebase search found the following relevant items:
`;
                    contextPayload.codebaseSearchResults.slice(0, 5).forEach((result: any) => {
                        searchContextSummary += `  - In file: ${result.filePath}
`;
                        result.symbols.forEach((symbol: any) => {
                            searchContextSummary += `    - Symbol '${symbol.name}' (${symbol.type}) at line ${symbol.line}
`;
                        });
                    });
                }

                const systemPrompt = await this.createSystemPrompt(contextPayload.activeFilePath, contextPayload.uiLanguage, contextPayload.folderOverview) + (searchContextSummary ? `

## Codebase Search Context
${searchContextSummary}` : "");

                this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: 'Context received. Thinking...' } });

				if (this.llmConversationHistory.length > 0 && this.llmConversationHistory[0].role === 'system') {
					this.llmConversationHistory[0].content = systemPrompt;
				} else {
					this.llmConversationHistory.unshift({ role: 'system', content: systemPrompt });
				}
				await this.saveCurrentLlmHistory();
				await this.processLlmResponse();
				break;
            case 'response-comment-generation':
            case 'response-refactoring-suggestions':
            case 'response-documentation-generation':
            case 'response-test-generation':
            case 'response-code-execution':
                if (message.payload?.rawContent) {
                    const rawContent = message.payload.rawContent;
                    this.llmConversationHistory.push({ role: 'assistant', content: rawContent });
                    await this.saveCurrentLlmHistory();
                    // If a plan is in progress, continue to the next step.
                    if (this.currentPlan.length > 0) {
                        const nextStepIndex = this.currentPlan.findIndex(step => step.status === 'in-progress');
                        if (nextStepIndex !== -1) {
                            this.currentPlan[nextStepIndex].status = 'completed';
                            this._onDidPostMessage.fire({ command: 'updatePlanStep', payload: { index: nextStepIndex, status: 'completed' } });
                            await this.executePlan(); // Execute the next step
                        } else {
                            this.currentPlan = []; // Plan is done
                        }
                    } else {
                        this.parseAndSendFinalResponse(rawContent);
                    }
                } else {
                    this.developerLogService.log(`ERROR: Received invalid or empty payload from ${message.sender}. Payload: ${JSON.stringify(message.payload)}`);
                    this.handleError(new Error(`Received an empty or invalid response from the ${message.sender}.`));
                }
                break;
            case 'response-security-analysis':
                this.updateDiagnostics(message.payload.filePath, message.payload.issues);
                break;
			case 'response-archived-context':
				const { retrievedInfo } = message.payload;
				if (retrievedInfo) {
					const archiveContextMessage: LlmMessage = {
						role: 'user',
						content: `Retrieved from archive: ${retrievedInfo}`
					};
					this.llmConversationHistory.push(archiveContextMessage);
					await this.saveCurrentLlmHistory();
                    this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: 'Archived context found. Thinking...' } });
					await this.processLlmResponse();
				}
				break;
        }
    }

	/**
	 * Sends the complete, current state of all relevant settings to the UI.
	 * @private
	 */
    private async sendFullSettingsToUI() {
        const authMode = this.configService.getAuthMode();
        const isLoggedIn = await this.authService.isLoggedIn();
        const account = await this.authService.getAccount();
        const apiKeys = this.configService.getApiKeys();
        const endpoint = this.configService.getEndpoint();
        this._onDidPostMessage.fire({ command: 'fullSettingsResponse', payload: { authMode, isLoggedIn, account, apiKey: apiKeys[0] || '', endpoint, isAutonomousMode: this.isAutonomousMode } });
    }

	/**
	 * Handles a user's text query by creating and executing a multi-step plan.
	 * @param {string} userText The raw text from the user.
	 * @private
	 */
    private async handleChatAndSpecialistCommands(userText: string): Promise<void> {
        if (!userText) {return;}

        const userMessage: ChatMessage = { author: 'user', content: [{ type: 'text', text: userText }] };
        this.addMessageToHistory(userMessage);
        this.llmConversationHistory.push({ role: 'user', content: userText });

        await this.createAndExecutePlan(userText);
    }

	/**
	 * Creates a multi-step plan based on the user's request using an LLM call,
	 * then begins execution of that plan.
	 * @param {string} userText The user's request.
	 * @private
	 */
    private async createAndExecutePlan(userText: string): Promise<void> {
        this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: 'Creating a plan...' } });

        const planPrompt = `Based on the user's request, create a step-by-step execution plan. Each step should be a clear, actionable task that can be routed to a specialist agent. Respond with a JSON array of strings. For example: ["Step 1: Description", "Step 2: Description"].

User Request: "${userText}"`;

        try {
            const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
            const apiKeys = this.configService.getApiKeys();
            const endpoint = this.configService.getEndpoint();
            const response = await this.llmService.requestLLMCompletion([{ role: 'user', content: planPrompt }], apiKeys[0] || '', endpoint, [], model);
            const planJson = response.choices[0]?.message?.content?.trim();

            if (planJson) {
                const planDescriptions = JSON.parse(planJson);
                this.currentPlan = planDescriptions.map((desc: string) => ({ description: desc, status: 'pending' }));
                this._onDidPostMessage.fire({ command: 'displayPlan', payload: { plan: this.currentPlan } });
                await this.executePlan();
            } else {
                throw new Error('LLM failed to generate a plan.');
            }
        } catch (error) {
            console.error('Failed to create or parse plan, falling back to simple routing:', error);
            await this.routeAndDelegate(userText, userText); // Fallback to old logic
        }
    }

	/**
	 * Executes the next pending step in the current plan.
	 * If no steps are pending, it finalizes the plan.
	 * @private
	 */
    private async executePlan(): Promise<void> {
        const nextStepIndex = this.currentPlan.findIndex(step => step.status === 'pending');
        if (nextStepIndex === -1) {
            this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: 'Plan finished.' } });
            this.parseAndSendFinalResponse('All steps completed successfully.');
            this.currentPlan = [];
            return;
        }

        const step = this.currentPlan[nextStepIndex];
        this.currentPlan[nextStepIndex].status = 'in-progress';
        this._onDidPostMessage.fire({ command: 'updatePlanStep', payload: { index: nextStepIndex, status: 'in-progress' } });

        await this.routeAndDelegate(step.description, this.llmConversationHistory.find(m => m.role === 'user')?.content || '');
    }

	/**
	 * Routes a task (a step in the plan) to the most appropriate specialist agent using an LLM call.
	 * @param {string} stepDescription The description of the task to be routed.
	 * @param {string} originalQuery The original user query for context.
	 * @private
	 */
    private async routeAndDelegate(stepDescription: string, originalQuery: string): Promise<void> {
        const specialistAgents = [
            {
                name: 'RefactoringSuggestionAgent',
                description: 'Analyzes the current code file and suggests improvements or refactorings. Use for requests like "refactor this", "improve this code", "make this better".'
            },
            {
                name: 'DocumentationGenerationAgent',
                description: 'Generates documentation or explanations for the code in the current file. Use for requests like "document this function", "explain this code", "how does this work?".'
            },
            {
                name: 'CommentGenerationAgent',
                description: 'Adds inline comments to the code in the current file. Use for requests like "add comments to this code", "comment this file".'
            },
            {
                name: 'TestGenerationAgent',
                description: 'Writes unit tests for the code in the current file. Use for requests like "write tests for this", "create a test case", "generate unit tests".'
            },
            {
                name: 'CodeExecutionAgent',
                description: 'Executes a shell command in the terminal. Use for requests like "run this command", "execute this script", "install this package".'
            }
        ];

        const routingPrompt = `You are an expert system for routing user requests to the correct specialist agent. Based on the user's query, decide which of the following agents is most appropriate. Respond with ONLY the name of the agent, or "Conversational" if no specialist is suitable.

Available Agents:
${specialistAgents.map(agent => `- ${agent.name}: ${agent.description}`).join('
')}

---
User Query: "${stepDescription}"
---

Chosen Agent:`;

        const messages: LlmMessage[] = [
            { role: 'system', content: routingPrompt }
        ];

        try {
            this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: `Finding the right tool for: "${stepDescription}"` } });
            const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
            const apiKeys = this.configService.getApiKeys();
            const endpoint = this.configService.getEndpoint();

            const response = await this.llmService.requestLLMCompletion(messages, apiKeys[0] || '', endpoint, [], model);
            const chosenAgent = response.choices[0]?.message?.content?.trim();

            this.developerLogService.log(`Router LLM chose: ${chosenAgent} for step: ${stepDescription}`);

            switch (chosenAgent) {
                case 'RefactoringSuggestionAgent':
                    this.delegateToSpecialist('RefactoringSuggestionAgent', 'request-refactoring-suggestions', stepDescription);
                    break;
                case 'DocumentationGenerationAgent':
                    this.delegateToSpecialist('DocumentationGenerationAgent', 'request-documentation-generation', stepDescription);
                    break;
                case 'CommentGenerationAgent':
                    this.delegateToSpecialist('CommentGenerationAgent', 'request-comment-generation', stepDescription);
                    break;
                case 'TestGenerationAgent':
                    this.delegateToSpecialist('TestGenerationAgent', 'request-test-generation', stepDescription);
                    break;
                case 'CodeExecutionAgent':
                    this.dispatch({
                        sender: OrchestratorAgent.AGENT_ID,
                        recipient: 'CodeExecutionAgent',
                        timestamp: new Date().toISOString(),
                        type: 'request-code-execution',
                        payload: { command: stepDescription } // Use the step description as the command
                    });
                    break;
                case 'Conversational':
                default:
                    this.dispatch({ sender: OrchestratorAgent.AGENT_ID, recipient: 'ContextManagementAgent', timestamp: new Date().toISOString(), type: 'request-context', payload: { query: originalQuery } });
                    break;
            }
        } catch (error: any) {
            console.error('Error routing request via LLM:', error);
            this.developerLogService.log(`ERROR: Failed to route request via LLM. Falling back to default. ${error.message}`);
            this.dispatch({ sender: OrchestratorAgent.AGENT_ID, recipient: 'ContextManagementAgent', timestamp: new Date().toISOString(), type: 'request-context', payload: { query: originalQuery } });
        }
    }

    private addMessageToHistory(message: ChatMessage): void {
        this.chatHistory.push(message);
        this.saveCurrentChatHistory();
    }

    private getSessionChatHistoryKey(sessionId: string): string {
        return `session:${sessionId}:chatHistory`;
    }

    private getSessionLlmHistoryKey(sessionId: string): string {
        return `session:${sessionId}:llmHistory`;
    }

    private async saveCurrentChatHistory(): Promise<void> {
        const activeId = this.state.get<string>(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, '');
        if (activeId) {
            await this.state.update(this.getSessionChatHistoryKey(activeId), this.chatHistory);
            const sessions = this.state.get<any[]>(OrchestratorAgent.SESSIONS_INDEX_KEY, []) || [];
            const idx = sessions.findIndex(s => s.id === activeId);
            if (idx >= 0) {
                sessions[idx] = { ...sessions[idx], messageCount: this.chatHistory.length };
                await this.state.update(OrchestratorAgent.SESSIONS_INDEX_KEY, sessions);
            }
        }
    }

    private async saveCurrentLlmHistory(): Promise<void> {
        const activeId = this.state.get<string>(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, '');
        if (activeId) {
            await this.state.update(this.getSessionLlmHistoryKey(activeId), this.llmConversationHistory);
        }
    }

    private delegateToSpecialist(recipient: string, type: string, query: string): void {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            console.log(`[${OrchestratorAgent.AGENT_ID}] Specialist command used without an active file. Falling back to conversational AI.`);
            this.dispatch({ sender: OrchestratorAgent.AGENT_ID, recipient: 'ContextManagementAgent', timestamp: new Date().toISOString(), type: 'request-context', payload: { query } });
            return;
        }
        const filePath = activeEditor.document.uri.fsPath;
        this.dispatch({ sender: OrchestratorAgent.AGENT_ID, recipient, timestamp: new Date().toISOString(), type, payload: { filePath, query } });
    }

    private async createSystemPrompt(activeFilePath?: string, uiLanguage?: string, folderOverview?: string): Promise<string> {
        const basePrompt = 'You are a helpful AI assistant inside VS Code. Your primary goal is to provide a conversational response.';
        let agentMdContent = '';
        try {
            const agentMdPath = path.join(this.configService.getExtensionPath(), '.agent', 'AGENT.md');
            agentMdContent = await fs.readFile(agentMdPath, 'utf-8');
        } catch (error) {
            console.warn('[OrchestratorAgent] AGENT.md not found or could not be read.');
        }

        let memoryContent = '';
        try {
            const memoryPath = path.join(this.configService.getExtensionPath(), '.agent', 'memory.json');
            const memoryJson = await fs.readFile(memoryPath, 'utf-8');
            const memories = JSON.parse(memoryJson);
            if (memories.length > 0) {
                memoryContent = `

## Memory (User Feedback)
This is a list of facts, preferences, and corrections provided by the user. You MUST adhere to them.
- ` + memories.join('
- ');
            }
        } catch (error) {
            console.warn('[OrchestratorAgent] memory.json not found or could not be read.');
        }

        let context = '';
        if (uiLanguage) {
            context += `
- The user's language is '${uiLanguage}'. You should respond in this language.`;
        }
        if (activeFilePath && activeFilePath !== 'N/A') {
            context += `
- The user currently has the file '${activeFilePath}' open.`;
        }
        if (folderOverview && folderOverview !== 'N/A' && !folderOverview.includes('No folder overview file found')) {
            context += `

## Directory Overview (_folder_overview.md)
**CRITICAL: You MUST consult this overview to understand the directory structure and the purpose of each file.** This is your primary source of information for navigating the project. The content is from the 
_folder_overview.md
 file in the relevant directory.

${folderOverview}`;
        } else {
            context += `

## Directory Overview
**WARNING: 
_folder_overview.md
 was not found in the current directory.** You have limited information about the project structure. You may need to use file system tools to explore the directory if the user's request requires it.`;
        }

        let autonomousInstructions = '';
        if (this.isAutonomousMode) {
            autonomousInstructions = `

**AUTONOMOUS MODE ACTIVATED:** You are in a continuous execution loop. You MUST use tools to make progress towards the user's goal. When you are completely certain that the entire request is finished, you MUST call the "TaskCompletionTool" with a summary of the work completed to exit the loop. Do not ask for intermediate reports or confirmation unless absolutely necessary.`;
        }

        const completionInstruction = `

**FINAL REPORTING:** If the last message in the history is a result from "TaskCompletionTool", your ONLY job is to provide a final, comprehensive summary to the user based on the entire conversation. Do not call any more tools.`;

        const memoryToolInstruction = `

**MEMORY:** You have access to a 'MemoryTool'. If the user corrects you or states a clear preference, you should use this tool to save the information as a concise fact. For example, if the user says 'No, use tabs instead of spaces', you should call the tool like this: MemoryTool({fact: 'User prefers tabs over spaces for indentation.'})`;

        const gitignoreToolInstruction = `

**GITIGNORE:** You have access to a 'GitignoreTool'. If the user asks to create or update a .gitignore file, you should use this tool. You can optionally provide a list of project types (e.g., 'node', 'python'), or call it with no arguments to have it auto-detect the project types.`;

        return basePrompt + 
            (agentMdContent ? `

## User Instructions (AGENT.md)
${agentMdContent}` : '') + 
            memoryContent +
            (context ? `

## Environment Context${context}` : '') + 
            autonomousInstructions + 
            completionInstruction + 
            memoryToolInstruction +
            gitignoreToolInstruction +
            `

You can use a <thought> tag to reason about the user's request. This thought process will not be shown to the user.` + 
            `
When providing long blocks of text, such as code, logs, or file dumps, that might not be essential for the immediate next turn of the conversation, you MUST wrap that content within <prunable>...</prunable> tags. This helps manage the context efficiently.` + 
            `
**CRITICAL INSTRUCTION:** After your thought process, you MUST provide a user-facing response. The final response for the user must be outside of any tags. If you have nothing to say, respond with a message indicating that. DO NOT provide an empty response.`;
    }

	private getPrunedHistory(): LlmMessage[] {
        return this.llmConversationHistory.map(message => {
            if (message.pruningState === 'prune') {
                return { ...message, content: '[Content pruned for brevity]' };
            }
            return message;
        });
	}

	/**
	 * Summarizes the conversation history if it exceeds a token threshold.
	 * This is a crucial mechanism for managing long-term context with the LLM.
	 * @param {LlmMessage[]} history The conversation history to potentially summarize.
	 * @returns {Promise<LlmMessage[]>} The new, potentially summarized, conversation history.
	 * @private
	 */
	private async summarizeHistory(history: LlmMessage[]): Promise<LlmMessage[]> {
		const tokenThreshold = this.configService.getContextTokenThreshold();
		console.log(`[OrchestratorAgent DEBUG] summarizeHistory called. Last prompt tokens: ${this.lastPromptTokenCount}, Threshold: ${tokenThreshold}`);
		this.developerLogService.log(`Attempting to summarize conversation history. Last prompt tokens: ${this.lastPromptTokenCount}, Threshold: ${tokenThreshold}`);

		const systemPrompt = history[0];
		let splitIndex = Math.floor(history.length / 2);

		while (splitIndex > 1) {
			const messageAtSplit = history[splitIndex];
			const messageBeforeSplit = history[splitIndex - 1];

			if (messageAtSplit.role === 'tool') {
				this.developerLogService.log(`Adjusting summary split point from ${splitIndex} to ${splitIndex - 1} to avoid starting with a tool message.`);
				splitIndex--;
				continue;
			}

			if (messageBeforeSplit.role === 'assistant' && messageBeforeSplit.tool_calls) {
				this.developerLogService.log(`Adjusting summary split point from ${splitIndex} to ${splitIndex - 1} to avoid splitting after a tool call request.`);
				splitIndex--;
				continue;
			}

			break;
		}

		if (splitIndex <= 1) {
			this.developerLogService.log('Summarization skipped: Not enough safe messages to summarize.');
			return history;
		}

        const conversationToSummarize = history.slice(1, splitIndex);
        const remainingConversation = history.slice(splitIndex);

		const summarizationPrompt: LlmMessage[] = [
			{ role: 'system', content: 'You are a conversation summarization assistant. Summarize the following user and assistant messages into a concise paragraph that retains the key context.' },
			{ role: 'user', content: JSON.stringify(conversationToSummarize) }
		];

		try {
			const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
			const apiKeys = this.configService.getApiKeys();
			const endpoint = this.configService.getEndpoint();
			const response = await this.llmService.requestLLMCompletion(summarizationPrompt, apiKeys[0] || '', endpoint, [], model);
            const summaryContent = response.choices[0]?.message?.content;

			if (summaryContent) {
				this.developerLogService.log(`Summarization successful.`);
                return [
                    systemPrompt,
                    { role: 'system', content: `Summary of the beginning of the conversation: ${summaryContent}` },
                    ...remainingConversation
                ];
			}
		} catch (error: any) {
			this.developerLogService.log(`Conversation summarization failed: ${error.message}`);
		}

		return history;
	}

	/**
	 * The main processing loop for handling LLM responses.
	 * It sends the current conversation to the LLM, handles streaming back the response,
	 * and then decides the next action (e.g., call a tool, send a message, or continue in a loop).
	 * @private
	 */
	private async processLlmResponse(): Promise<void> {
		try {
            this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: 'Thinking...' } });
			const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
			const apiKeys = this.configService.getApiKeys();
			const endpoint = this.configService.getEndpoint();
			const toolSchemas = this.mcpServer.getToolSchemas();

			const conversationForLlm = this.getPrunedHistory();

			console.log(`[OrchestratorAgent DEBUG] Conversation history being sent to LLM:
${JSON.stringify(conversationForLlm, null, 2)}`);

            let isFirstChunk = true;
            const onChunk = (chunk: string) => {
                if (isFirstChunk) {
                    this._onDidPostMessage.fire({ command: 'responseStart' });
                    isFirstChunk = false;
                }
                this._onDidPostMessage.fire({ command: 'responseChunk', payload: { text: chunk } });
            };

			const fullResponse = await this.llmService.requestLLMCompletion(conversationForLlm, apiKeys[0] || '', endpoint, toolSchemas, model, onChunk);

            if (fullResponse.usage?.prompt_tokens) {
                this.lastPromptTokenCount = fullResponse.usage.prompt_tokens;
                this.developerLogService.log(`LLM call used ${this.lastPromptTokenCount} prompt tokens.`);
            }

            const response = fullResponse.choices[0]?.message;
            if (!response) {
                this.handleError(new Error("The AI returned an invalid or empty response object."));
                return;
            }

			if (response.tool_calls && response.tool_calls.length > 0) {
                const completionToolCall = response.tool_calls.find((toolCall: any) => toolCall.function.name === 'TaskCompletionTool');
                if (completionToolCall) {
                    this.stopAutonomousMode('TaskCompletionTool was called.');
                    const summary = JSON.parse(completionToolCall.function.arguments).summary;
                    this.llmConversationHistory.push(response);
                    const toolResultContent = JSON.stringify({text: `All tasks are complete. Summary: ${summary}`});
                    this.llmConversationHistory.push({ role: 'tool', tool_call_id: completionToolCall.id, name: 'TaskCompletionTool', content: toolResultContent });
                    await this.saveCurrentLlmHistory();
                    await this.processLlmResponse();
                    return;
                }

				this.llmConversationHistory.push(response);
				this.developerLogService.log(`LLM requested tool calls: ${JSON.stringify(response.tool_calls)}`);

				const toolResults = await Promise.all(response.tool_calls.map(async (toolCall: any) => {
					const toolName = toolCall.function.name;
					const toolArgs = JSON.parse(toolCall.function.arguments);
					try {
						const mcpRequest: any = {
							jsonrpc: '2.0', id: toolCall.id, method: 'tools/call',
							params: { name: toolName, arguments: toolArgs }
						};
						const mcpResponse = await this.mcpServer.handleRequest(mcpRequest);

						const statusMessage = this.createStatusUpdateMessage(toolName, toolArgs);
						if (statusMessage) {
							this._onDidPostMessage.fire({ command: 'response', payload: { text: statusMessage } });
							this.addMessageToHistory({ author: 'agent', content: [{ type: 'text', text: statusMessage }] });
						}

                        let content;
                        if (mcpResponse.error) {
                            content = JSON.stringify({ error: mcpResponse.error.message || 'Tool execution failed' });
                        } else {
                            content = JSON.stringify(mcpResponse.result);
                        }

						return { tool_call_id: toolCall.id, role: 'tool' as const, name: toolName, content: content };
					} catch (toolError: any) {
						return { tool_call_id: toolCall.id, role: 'tool' as const, name: toolName, content: JSON.stringify({ error: toolError.message }) };
					}
				}));

				for (const result of toolResults) {
					this.llmConversationHistory.push(result);
				}


			} else if (response.content) {
				const lackOfContextPhrases = ["i don't have enough information", "i need more context", "i don't know about that"];
				if (lackOfContextPhrases.some(phrase => response.content!.toLowerCase().includes(phrase))) {
					const lastUserMessage = this.llmConversationHistory.filter(m => m.role === 'user').pop();
					if (lastUserMessage && lastUserMessage.content) {
						this.dispatch({
							sender: OrchestratorAgent.AGENT_ID,
							recipient: 'ContextArchiveAgent',
							timestamp: new Date().toISOString(),
							type: 'searchArchivedContext',
							payload: { query: lastUserMessage.content }
						});
						return;
					}
				}

				const prunableRegex = /<prunable>[\s\S]*?<\/prunable>/;
				if (prunableRegex.test(response.content)) {
					response.pruningState = 'pending';
				}
				this.llmConversationHistory.push(response);
			} else {
				this.handleError(new Error("The AI returned a response with no content or tool calls."));
				return;
			}

			const tokenThreshold = this.configService.getContextTokenThreshold();
			if (tokenThreshold > 0 && this.lastPromptTokenCount > tokenThreshold) {
				this.developerLogService.log(`Prompt tokens (${this.lastPromptTokenCount}) exceeded threshold (${tokenThreshold}). Summarizing history for the next turn.`);
				this.llmConversationHistory = await this.summarizeHistory(this.llmConversationHistory);
			}

			await this.saveCurrentLlmHistory();

			if (response.tool_calls && response.tool_calls.length > 0) {
				const statusMessage = 'Tools executed. Thinking about the next step...';
				this._onDidPostMessage.fire({ command: 'statusUpdate', payload: { text: statusMessage } });
				this.addMessageToHistory({ author: 'agent', content: [{ type: 'text', text: statusMessage }] });
				await this.processLlmResponse();
			} else if (response.content) {
				this.parseAndSendFinalResponse(response.content);

				if (this.isAutonomousMode) {
					// SAFETY NET: If the AI says it's done but didn't use the tool, force stop the loop.
					const completionPhrases = ["all tasks are complete", "all phases are complete", "finished every step", "project is complete", "development is complete"];
					const isIndicatingCompletion = completionPhrases.some(phrase => response.content!.toLowerCase().includes(phrase));

					if (isIndicatingCompletion) {
						this.stopAutonomousMode('AI indicated completion without calling TaskCompletionTool.');
					} else {
						this.developerLogService.log('Autonomous mode: Injecting continuation message and re-triggering loop.');
						this.llmConversationHistory.push({
							role: 'user',
							content: 'Proceed to the next phase based on the plan.'
						});
						await this.saveCurrentLlmHistory();
						await this.processLlmResponse();
					}
				}
			}
		} catch (error: any) {
			this.handleError(error);
		}
	}

	private stopAutonomousMode(reason: string): void {
		if (this.isAutonomousMode) {
			this.developerLogService.log(`Autonomous mode stopped: ${reason}`);
			this.isAutonomousMode = false;
			this._onDidPostMessage.fire({ command: 'loopModeChanged', payload: false });
		}
	}

	private createStatusUpdateMessage(toolName: string, toolArgs: any): string | null {
		switch (toolName) {
			case 'FileWriteTool':
				return `Modifying file: 
${toolArgs.filePath}
``;
			case 'FileReadTool':
				return `Reading file: 
${toolArgs.filePath}
``;
			case 'TerminalExecutionTool':
				return `Running terminal command: 
$ ${toolArgs.command}
``;
			case 'WebSearchTool':
				return `Searching the web for: "${toolArgs.query}"`;
			default:
				return null;
		}
	}

	private parseThoughtAndUserFacingText(rawContent: string | null): { thought?: string, userFacingText: string } {
		if (!rawContent) {
			return { userFacingText: '' };
		}

		const thoughtRegex = /<thought>([\s\S]*?)<\/thought>|<\|channel\|>analysis<\|message\|>([\s\S]*?)<\|end\|>/;
		const thoughtMatch = rawContent.match(thoughtRegex);

		const thought = thoughtMatch ? (thoughtMatch[1] || thoughtMatch[2] || '').trim() : undefined;
		const userFacingText = rawContent.replace(thoughtRegex, '').trim();

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

		let textToDisplay = userFacingText.replace(/<\/?prunable>/g, '');

		if (!textToDisplay && thought) {
			this.developerLogService.log("No user-facing text found. Displaying thought as main response.");
			textToDisplay = `I have processed the request. See my thought process for details.`;
		}

        const historyMessage: ChatMessage = {
            author: 'agent',
            content: [{ type: 'text', text: textToDisplay }]
        };
        this.addMessageToHistory(historyMessage);

        this._onDidPostMessage.fire({
            command: 'responseEnd',
            payload: { thought: thought }
        });
	}

	private handleError(error: any): void {
		console.error(`[${OrchestratorAgent.AGENT_ID}] Handling error:`, error);
		this.developerLogService.log(`ERROR: ${error.stack}`);

		let userMessage = `An unexpected error occurred: ${error.message}`;
		let buttonLabel: string | undefined;
		let buttonAction: string | undefined;

		const errorMessage = error.message.toLowerCase();

		if (errorMessage.includes('api key') || errorMessage.includes('authentication')) {
			userMessage = 'There seems to be an issue with your API key or authentication. Please verify your settings.';
			buttonLabel = 'Open Settings';
			buttonAction = 'openSettings';
		} else if (errorMessage.includes('endpoint') || errorMessage.includes('network')) {
			userMessage = 'Could not connect to the AI service. Please check your network connection and endpoint configuration.';
			buttonLabel = 'Open Settings';
			buttonAction = 'openSettings';
		} else if (errorMessage.includes('displayable response') || errorMessage.includes('empty response')) {
			userMessage = error.message;
		}

		this._onDidPostMessage.fire({
			command: 'displayError',
			payload: { message: userMessage, buttonLabel, buttonAction }
		});
	}

	private updateDiagnostics(filePath: string, issues: any[]): void {
		const diagnostics: vscode.Diagnostic[] = issues.map(issue => {
			const range = new vscode.Range(issue.line - 1, 0, issue.line - 1, 100);
			const severity = issue.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
			return new vscode.Diagnostic(range, issue.message, severity);
		});
		const uri = vscode.Uri.file(filePath);
		this.diagnosticCollection.set(uri, diagnostics);
	}
}