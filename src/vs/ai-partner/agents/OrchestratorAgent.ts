import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';
import { MCPServer } from '../server/MCPServer';
import { LLMService, LlmMessage } from '../services/LLMService';
import { AuthService } from '../auth_service';
import { ConfigService } from '../config_service';
import { DeveloperLogService } from '../services/DeveloperLogService';

// --- Type Definitions ---
type ChatMessage = { author: 'user' | 'agent', content: any[] };

interface ChatMessagePayload {
  text: string;      // 최종 사용자 대면 콘텐츠
  thought?: string;  // <thought> 태그 내부의 콘텐츠
}

// --- OrchestratorAgent Class ---
export class OrchestratorAgent {
	private static readonly AGENT_ID = 'OrchestratorAgent';
	private static readonly SESSIONS_INDEX_KEY = 'aiPartnerChatSessionsIndex';
	private static readonly ACTIVE_SESSION_ID_KEY = 'aiPartnerActiveChatSessionId';

	private dispatch: (message: A2AMessage<any>) => Promise<void>;
	private mcpServer: MCPServer;
	private llmService: LLMService;
	private authService: AuthService;
	private configService: ConfigService;
	private state: vscode.Memento;
	private diagnosticCollection: vscode.DiagnosticCollection;
	private webview: vscode.WebviewView | undefined;
	private developerLogService: DeveloperLogService;
	private chatHistory: ChatMessage[] = [];
	private llmConversationHistory: LlmMessage[] = [];

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
		this.loadOrInitializeSession();
	}

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

    public registerWebview(view: vscode.WebviewView | undefined): void {
        this.webview = view;
        if (view) {
            this.postMessageToUI({ command: 'loadHistory', payload: this.chatHistory });
        }
    }

    public async handleUIMessage(message: any): Promise<void> {
        console.log(`[${OrchestratorAgent.AGENT_ID}] Received message from ViewProvider:`, message);
        switch (message.command) {
            case 'loadInitialData':
                setTimeout(() => this.sendFullSettingsToUI(), 250);
                break;
            case 'userQuery':
                this.handleChatAndSpecialistCommands(message.query);
                break;
            case 'requestHistory': // This command is now for getting the list of sessions.
                {
                    // 세션 목록 반환
                    const sessions = this.state.get<any[]>(OrchestratorAgent.SESSIONS_INDEX_KEY, []) || [];
                    const activeId = this.state.get<string>(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, '');
                    this.postMessageToUI({ command: 'historyList', payload: { sessions, activeId } });
                }
                break;
			case 'selectChat':
			{
				const sessionId = message.sessionId as string;
				const activeId = this.state.get<string>(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, '');
				if (sessionId && sessionId !== activeId) {
					await this.state.update(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, sessionId);

					// [수정] 선택된 세션 ID에 맞는 두 종류의 히스토리를 모두 불러옵니다.
					this.chatHistory = this.state.get<ChatMessage[]>(this.getSessionChatHistoryKey(sessionId), []);
					this.llmConversationHistory = this.state.get<LlmMessage[]>(this.getSessionLlmHistoryKey(sessionId), []);

					this.postMessageToUI({ command: 'loadHistory', payload: this.chatHistory });
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

				// [수정] 새 세션을 위해 두 종류의 히스토리를 모두 초기화합니다.
				this.chatHistory = [];
				this.llmConversationHistory = [];

				// [수정] 초기화된 히스토리를 새 세션 ID로 저장합니다.
				await this.state.update(this.getSessionChatHistoryKey(newId), this.chatHistory);
				await this.state.update(this.getSessionLlmHistoryKey(newId), this.llmConversationHistory);

				this.postMessageToUI({ command: 'historyList', payload: { sessions, activeId: newId } });
				this.postMessageToUI({ command: 'loadHistory', payload: this.chatHistory });
			}
				break;
			case 'deleteChat':
			{
				const sessionIdToDelete = message.sessionId as string;
				if (!sessionIdToDelete) break;

				let sessions = this.state.get<any[]>(OrchestratorAgent.SESSIONS_INDEX_KEY, []) || [];
				let activeId = this.state.get<string>(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, '');

				// 세션 목록에서 삭제
				const remainingSessions = sessions.filter(s => s.id !== sessionIdToDelete);

				// 관련된 대화 기록 데이터 삭제
				this.state.update(this.getSessionChatHistoryKey(sessionIdToDelete), undefined);
				this.state.update(this.getSessionLlmHistoryKey(sessionIdToDelete), undefined);

				// 만약 활성 세션이 삭제되었다면, 다른 세션으로 전환
				if (activeId === sessionIdToDelete) {
					if (remainingSessions.length > 0) {
						activeId = remainingSessions[remainingSessions.length - 1].id; // 마지막 세션을 활성화
					} else {
						// 모든 세션이 삭제되었다면, 새 세션을 만듭니다.
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

				// 변경된 상태 저장
				this.state.update(OrchestratorAgent.SESSIONS_INDEX_KEY, remainingSessions);
				this.state.update(OrchestratorAgent.ACTIVE_SESSION_ID_KEY, activeId);

				// 현재 활성 세션의 기록을 다시 로드
				this.chatHistory = this.state.get<ChatMessage[]>(this.getSessionChatHistoryKey(activeId), []);
				this.llmConversationHistory = this.state.get<LlmMessage[]>(this.getSessionLlmHistoryKey(activeId), []);

				// UI에 변경사항 전파
				this.postMessageToUI({ command: 'historyList', payload: { sessions: remainingSessions, activeId } });
				this.postMessageToUI({ command: 'loadHistory', payload: this.chatHistory });
			}
				break;
            default:
                console.warn(`[${OrchestratorAgent.AGENT_ID}] Received unknown command: ${message.command}`);
                break;
        }
    }

    public async handleSessionChange(): Promise<void> {
        if (this.webview) {
            await this.sendFullSettingsToUI();
        }
    }

    public async handleA2AMessage(message: A2AMessage<any>): Promise<void> {
        switch (message.type) {
            case 'response-context':
                const contextPayload = message.payload;
                let searchContextSummary = "";

                if (contextPayload.codebaseSearchResults && contextPayload.codebaseSearchResults.length > 0) {
                    searchContextSummary += `Codebase search found the following relevant items:\n`;
                    // Limit to 5 results to keep context from getting too large
                    contextPayload.codebaseSearchResults.slice(0, 5).forEach((result: any) => {
                        searchContextSummary += `  - In file: ${result.filePath}\n`;
                        result.symbols.forEach((symbol: any) => {
                            searchContextSummary += `    - Symbol '${symbol.name}' (${symbol.type}) at line ${symbol.line}\n`;
                        });
                    });
                }

                const systemPrompt = this.createSystemPrompt(contextPayload.activeFilePath, contextPayload.uiLanguage) + (searchContextSummary ? `\n\n## Codebase Search Context\n${searchContextSummary}` : "");

                // If the first message is a system prompt, replace it to update the context. Otherwise, add a new one.
				if (this.llmConversationHistory.length > 0 && this.llmConversationHistory[0].role === 'system') {
					this.llmConversationHistory[0].content = systemPrompt;
				} else {
					this.llmConversationHistory.unshift({ role: 'system', content: systemPrompt });
				}
				this.saveCurrentLlmHistory();

				// [수정] 인자 없이 함수를 호출합니다.
				await this.processLlmResponse();
				break;
            case 'response-refactoring-suggestions':
            case 'response-documentation-generation':
                if (message.payload?.content?.[0]?.text) {
                    const textContent = message.payload.content[0].text;
                    // Add the specialist's response to the LLM history to maintain context
                    this.llmConversationHistory.push({ role: 'assistant', content: textContent });
                    this.saveCurrentLlmHistory();

                    // Process and send to UI as before
                    this.parseAndSendFinalResponse(textContent);
                }
                break;
            case 'response-security-analysis':
                this.updateDiagnostics(message.payload.filePath, message.payload.issues);
                break;
        }
    }

    private postMessageToUI(message: any): void {
        this.webview?.webview.postMessage(message);
    }

    private async sendFullSettingsToUI() {
        const authMode = this.configService.getAuthMode();
        const isLoggedIn = await this.authService.isLoggedIn();
        const account = await this.authService.getAccount();
        const apiKeys = this.configService.getApiKeys();
        const endpoint = this.configService.getEndpoint();
        this.postMessageToUI({ command: 'fullSettingsResponse', payload: { authMode, isLoggedIn, account, apiKey: apiKeys[0] || '', endpoint } });
    }

    private handleChatAndSpecialistCommands(userText: string): void {
        if (!userText) return;
        const userMessage: ChatMessage = { author: 'user', content: [{ type: 'text', text: userText }] };
        this.addMessageToHistory(userMessage);
        this.llmConversationHistory.push({ role: 'user', content: userText });
        const lowerCaseQuery = userText.toLowerCase();
        if (lowerCaseQuery.includes('refactor') || lowerCaseQuery.includes('improve')) {
            this.delegateToSpecialist('RefactoringSuggestionAgent', 'request-refactoring-suggestions', userText);
        } else if (lowerCaseQuery.includes('document') || lowerCaseQuery.includes('explain')) {
            this.delegateToSpecialist('DocumentationGenerationAgent', 'request-documentation-generation', userText);
        } else {
            this.saveCurrentLlmHistory();
            this.dispatch({ sender: OrchestratorAgent.AGENT_ID, recipient: 'ContextManagementAgent', timestamp: new Date().toISOString(), type: 'request-context', payload: { query: userText } });
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
            // If no file is open, fall back to the general conversational flow
            // instead of showing an error. The LLM can then ask the user to open a file.
            console.log(`[${OrchestratorAgent.AGENT_ID}] Specialist command used without an active file. Falling back to conversational AI.`);
            this.dispatch({ sender: OrchestratorAgent.AGENT_ID, recipient: 'ContextManagementAgent', timestamp: new Date().toISOString(), type: 'request-context', payload: { query } });
            return;
        }
        const filePath = activeEditor.document.uri.fsPath;
        this.dispatch({ sender: OrchestratorAgent.AGENT_ID, recipient, timestamp: new Date().toISOString(), type, payload: { filePath, query } });
    }

	private createSystemPrompt(activeFilePath?: string, uiLanguage?: string): string {
		let context = '';
		if (uiLanguage) {
			context += `\n- The result of calling \`vscode.env.language\` is '${uiLanguage}'. You MUST use this value if the user's request involves determining the language. You should also respond in this language unless asked otherwise.`;
		}
		if (activeFilePath && activeFilePath !== 'N/A') {
			context += `\n- The user currently has the file '${activeFilePath}' open.`;
		}

		return `You are a helpful AI assistant inside VS Code. Your primary goal is to provide a conversational response.` +
			(context ? `\n\n## Environment Context${context}` : '') +
			`\n\nYou can use a <thought> tag to reason about the user's request. This thought process will not be shown to the user.` +
			`\n\n**CRITICAL INSTRUCTION:** After your thought process, you MUST provide a user-facing response. The final response for the user must be outside of any tags. If you have nothing to say, respond with a message indicating that. DO NOT provide an empty response.`;
	}

    /**
     * This method now implements a "tool-calling loop".
     * 1. It calls the LLM.
     * 2. If the LLM asks to use tools, it executes them via the MCPServer.
     * 3. It sends the tool results back to the LLM.
     * 4. The LLM then uses these results to generate a final text response.
	 * 5. 응답이 최종 답변(content)이면, UI에 내용을 표시하고 순환을 종료합니다.
     */
	private async processLlmResponse(): Promise<void> {
		try {
			const model = this.configService.getModel(OrchestratorAgent.AGENT_ID);
			const apiKeys = this.configService.getApiKeys();
			const endpoint = this.configService.getEndpoint();
			const toolSchemas = this.mcpServer.getToolSchemas();

			const response = await this.llmService.requestLLMCompletion(this.llmConversationHistory, apiKeys[0] || '', endpoint, toolSchemas, model);

			if (response.tool_calls && response.tool_calls.length > 0) {
				// [수정] LLM의 도구 사용 요청을 먼저 대화 기록에 추가합니다.
				this.llmConversationHistory.push(response);
				this.developerLogService.log(`LLM requested tool calls: ${JSON.stringify(response.tool_calls)}`);

				// [주석] 요청된 모든 도구를 병렬로 실행합니다.
				const toolResults = await Promise.all(response.tool_calls.map(async (toolCall: any) => {
					const toolName = toolCall.function.name;
					const toolArgs = JSON.parse(toolCall.function.arguments);
					try {
						const mcpRequest: any = {
							jsonrpc: '2.0', id: toolCall.id, method: 'tools/call',
							params: { name: toolName, arguments: toolArgs }
						};
						const mcpResponse = await this.mcpServer.handleRequest(mcpRequest);

						// [주석] 요청하신 대로, 도구 실행 성공 시 진행 상황 메시지를 생성하고 UI로 전송합니다.
						const statusMessage = this.createStatusUpdateMessage(toolName, toolArgs);
						if (statusMessage) {
							this.postMessageToUI({ command: 'response', payload: { text: statusMessage } });
							this.addMessageToHistory({ author: 'agent', content: [{ type: 'text', text: statusMessage }] });
						}

						return { tool_call_id: toolCall.id, role: 'tool' as const, name: toolName, content: JSON.stringify(mcpResponse.result) };
					} catch (toolError: any) {
						return { tool_call_id: toolCall.id, role: 'tool' as const, name: toolName, content: JSON.stringify({ error: toolError.message }) };
					}
				}));

				// [주석] 모든 도구의 실행 결과를 대화 기록에 추가합니다.
				for (const result of toolResults) {
					this.llmConversationHistory.push(result);
				}

				await this.saveCurrentLlmHistory();

				// [주석] 자율적으로 다음 단계를 위해 재귀적으로 함수를 호출합니다.
				await this.processLlmResponse();

			} else if (response.content) {
				// [수정] 최종 답변이 온 경우, 최종 응답만 기록에 추가하고 UI에 표시합니다.
				this.llmConversationHistory.push(response);
				await this.saveCurrentLlmHistory();
				this.parseAndSendFinalResponse(response.content);
			} else {
				this.handleError(new Error("The AI returned a response with no content or tool calls."));
			}
		} catch (error: any) {
			this.handleError(error);
		}
	}

	private createStatusUpdateMessage(toolName: string, toolArgs: any): string | null {
		switch (toolName) {
			case 'FileWriteTool':
				return `파일을 수정하거나 생성했습니다: \`${toolArgs.filePath}\``;
			case 'FileReadTool':
				return `파일 내용을 읽는 중입니다: \`${toolArgs.filePath}\``;
			case 'TerminalExecutionTool':
				return `터미널 명령어를 실행 중입니다: \`$ ${toolArgs.command}\``;
			case 'WebSearchTool':
				return `웹에서 검색 중입니다: "${toolArgs.query}"`;
			default:
				// 그 외 다른 도구들은 별도의 메시지를 표시하지 않음
				return null;
		}
		}

    private parseThoughtAndUserFacingText(rawContent: string | null): { thought?: string, userFacingText: string } {
        if (!rawContent) {
            return { userFacingText: '' };
        }

        // This regex captures the content within <thought>...</thought> or the specific <|channel|>...<|end|> tags.
        const thoughtRegex = /<thought>([\s\S]*?)<\/thought>|<\|channel\|>analysis<\|message\|>([\s\S]*?)<\|end\|>/;
        const thoughtMatch = rawContent.match(thoughtRegex);

        // Extract the thought and the user-facing text.
        const thought = thoughtMatch ? (thoughtMatch[1] || thoughtMatch[2] || '').trim() : undefined;
        const userFacingText = rawContent.replace(thoughtRegex, '').trim();

        return { thought, userFacingText };
    }

    private parseAndSendFinalResponse(rawContent: string | null): void {
        console.log(`[${OrchestratorAgent.AGENT_ID}] Raw LLM response content:`, rawContent);

        if (!rawContent) {
            this.developerLogService.log("Received null or empty content from LLM.");
            this.handleError(new Error("The AI returned an empty response. Please try again."));
            return;
        }

        const { thought, userFacingText } = this.parseThoughtAndUserFacingText(rawContent);

        if (thought) {
            this.developerLogService.log(`LLM Thought: ${thought}`);
        }

        let textToDisplay = userFacingText;
        let thoughtForUI = thought;

        // If there's no user-facing text but there is a thought, use the thought as the main response.
        if (!textToDisplay && thought) {
            this.developerLogService.log("No user-facing text found. Displaying thought as main response.");
            textToDisplay = `I have processed the request. See my thought process for details.`;
        }

        if (textToDisplay) {
            const historyMessage: ChatMessage = {
                author: 'agent',
                content: [{ type: 'text', text: textToDisplay }]
            };
            this.addMessageToHistory(historyMessage);

            const payloadForUI: ChatMessagePayload = {
                text: textToDisplay,
                thought: thoughtForUI
            };

            this.postMessageToUI({ command: 'response', payload: payloadForUI });
        } else {
            // This block is now only reached if both userFacingText and thought are empty.
            this.developerLogService.log("LLM response was empty after parsing. Failing.");
			this.handleError(new Error("The AI could not generate a displayable response. Please try again."));
		}
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
            userMessage = error.message; // Use the more specific error message directly
        }

        this.postMessageToUI({
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
