import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './Header';
import { SettingsPage } from './SettingsPage';
import { WelcomeScreen } from './WelcomeScreen';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { ErrorDisplay } from './ErrorDisplay';
import { PlanView, PlanStep } from './PlanView';
export type { PlanStep };
import { vscodeService } from './services/vscode';
import { createMessageHandlerRegistry, HandlerContext } from './messageHandlers';

export interface DisplayMessage {
	sender: 'user' | 'ai';
	messageId?: string;
	text: string;
	thought?: string;
	senderName?: string;
	timestamp?: string;
	requiresUserInput?: boolean;
	uroborosProposal?: {
		userText: string;
		complexityScore: number;
		expectedSteps: number;
		affectedScope: string;
		complexityReasons: string[];
	};
	attachments?: Array<{ type: 'file' | 'folder' | 'code' | 'mcp' | 'browser'; uri?: string; label: string; content?: string }>;

	diff?: {
		diffHtml: string;
		originalCode: string;
		modifiedCode: string;
		title: string;
		filePath: string;
		suggestionType: string;
	};
	kind?: 'normal' | 'task' | 'codeEditFile' | 'progress' | 'tool_trace';
	// Optional metadata used when kind === 'codeEditFile'
	filePath?: string;
	title?: string;
	suggestionType?: string;
	lintSummary?: string;
	isStreaming?: boolean;
    buttons?: Array<{
        label: string;
        command: string;
        payload?: any;
        style?: 'primary' | 'secondary' | 'danger';
    }>;
}

type ViewState = 'welcome' | 'chat' | 'settings';

type ChatSessionMeta = {
	id: string;
	title: string;
	createdAt: string;
	messageCount: number;
};

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        vscodeService.postMessage({ command: 'log', text: `[MainView] Uncaught error: ${error.message}\n${errorInfo.componentStack}` });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ 
                    padding: '16px', 
                    margin: '16px',
                    color: 'var(--vscode-errorForeground)',
                    backgroundColor: 'var(--vscode-inputValidation-errorBackground)',
                    border: '1px solid var(--vscode-inputValidation-errorBorder)',
                    borderRadius: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                        <span className="codicon codicon-error" />
                        <span>Something went wrong</span>
                    </div>
                    <div style={{ 
                        fontSize: '12px', 
                        fontFamily: 'var(--vscode-editor-font-family)',
                        whiteSpace: 'pre-wrap',
                        opacity: 0.9
                    }}>
                        {this.state.error?.message}
                    </div>
                    <button 
                        onClick={() => this.setState({ hasError: false })} 
                        style={{ 
                            alignSelf: 'flex-start',
                            padding: '6px 12px',
                            background: 'var(--vscode-button-background)',
                            color: 'var(--vscode-button-foreground)',
                            border: 'none',
                            borderRadius: '2px',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--vscode-button-hoverBackground)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--vscode-button-background)'}
                    >
                        Reload View
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export const MainView: React.FC = () => {
    return (
        <ErrorBoundary>
            <MainViewContent />
        </ErrorBoundary>
    );
};

const MainViewContent: React.FC = () => {
	const [view, setView] = useState<ViewState>('welcome');
    const viewRef = useRef<ViewState>('welcome');
	const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
	const [activeSessionId, setActiveSessionId] = useState<string>('');
	const [messages, setMessages] = useState<DisplayMessage[]>([]);
	const [plan, setPlan] = useState<PlanStep[]>([]);
	const [error, setError] = useState<{ title: string, message: string } | null>(null);
	const [showHistoryPanel, setShowHistoryPanel] = useState(false);
	const [isAutonomousMode, setAutonomousMode] = useState(false);
	const [statusText, setStatusText] = useState<string | null>(null);
    const [slashCommands, setSlashCommands] = useState<{ command: string, description: string }[]>([]);
    const [currentProvider, setCurrentProvider] = useState<'openai' | 'ollama' | 'anthropic' | 'xai' | 'google' | 'groq' | 'openrouter' | undefined>(undefined);
    const [availableModels, setAvailableModels] = useState<Array<{ id: string; maxContext?: number }>>([]);
    const [currentModel, setCurrentModel] = useState<string | undefined>(undefined);
    const [profiles, setProfiles] = useState<Array<{ id: string; name: string; provider?: string; endpoint?: string; model?: string }>>([]);
    const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
    const [loadingStatus, setLoadingStatus] = useState({
        llmSettings: true,
        models: true,
        profiles: true,
        slashCommands: true
    });

	const [isThinking, setIsThinking] = useState(false);
	const [uroborosProposal, setUroborosProposal] = useState<{
		userText: string;
		complexityScore: number;
		expectedSteps: number;
		affectedScope: string;
		complexityReasons: string[];
	} | null>(null);

	const mainViewRef = useRef<HTMLDivElement>(null);

    // Pending diffs summary state
    type PendingDiff = {
        diffHtml: string;
        originalCode: string;
        modifiedCode: string;
        title: string;
        filePath: string;
        suggestionType: string;
        senderName?: string;
        timestamp?: string;
        addedLines?: number;
        removedLines?: number;
    };
    const [pendingDiffs, setPendingDiffs] = useState<PendingDiff[]>([]);
    const [showDiffSummary, setShowDiffSummary] = useState<boolean>(false);
    const diffSummaryRef = useRef<HTMLDivElement>(null);

    // Attachments inserted via context menus or @commands
    type Attachment = { type: 'file' | 'folder' | 'code' | 'mcp' | 'browser'; uri?: string; label: string; content?: string };
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
    const lastUserAttachmentsRef = useRef<Attachment[]>([]);
    const dropIncomingRef = useRef<boolean>(false);
    const welcomeLockRef = useRef<boolean>(true); // true면 초기 로드에서 loadHistory를 무시하고 Welcome 유지

    useEffect(() => {
        // Rebuild pendingDiffs from messages (kind: 'codeEditFile' with diff)
        const diffsFromMessages = messages
            .filter(m => m.kind === 'codeEditFile' && m.diff)
            .map(m => m.diff as PendingDiff);
            
        setPendingDiffs(prev => {
            // Merge with existing ephemeral diffs but prioritize messages for structural consistency
            const merged = [...diffsFromMessages];
            prev.forEach(p => {
                if (!merged.some(m => m.filePath === p.filePath)) {
                    merged.push(p);
                }
            });
            return merged;
        });
    }, [messages]);

    useEffect(() => { viewRef.current = view; }, [view]);

	// Define mapHistoryToDisplayMessages first (used in handlerContext)
	const mapHistoryToDisplayMessages = (history: any[]): DisplayMessage[] => {
		if (!Array.isArray(history)) return [];
		return history.map((msg: any) => {
			const sender: 'user' | 'ai' = msg.author === 'user' ? 'user' : 'ai';
			let text = '';
			if (Array.isArray(msg.content)) {
				text = msg.content
					.filter((c: any) => c && (typeof c === 'string' || c.text || c.type === 'text'))
					.map((c: any) => typeof c === 'string' ? c : (c.text ?? ''))
					.filter((t: string) => !!t)
					.join('\n');
			}

			const baseMsg: DisplayMessage = {
				sender,
                messageId: msg.messageId, 
				text,
				thought: typeof msg.thought === 'string' && msg.thought ? msg.thought : undefined,
				senderName: msg.senderName,
				timestamp: msg.timestamp,
				requiresUserInput: !!(msg as any)?.requiresUserInput,
				kind: msg.kind || undefined,
                buttons: msg.buttons || undefined
			};

			// codeEditFile 메타데이터 복원
			if (msg.kind === 'codeEditFile') {
				baseMsg.filePath = msg.filePath;
				baseMsg.title = msg.title;
				baseMsg.suggestionType = msg.suggestionType;
				baseMsg.lintSummary = msg.lintSummary;
				baseMsg.diff = msg.diff;
			}

			return baseMsg;
		}).filter(msg => msg.kind !== 'tool_trace');
	};

	// Create handler context and registry following SDK pattern (similar to toolRegistry in MCPServer)
	const handlerContext: HandlerContext = {
		setSlashCommands,
		setCurrentProvider,
		setCurrentModel,
		setAvailableModels,
		setProfiles,
		setActiveProfileId,
		setSessions,
		setActiveSessionId,
		setMessages,
		setPlan,
		setStatusText,
		setIsThinking,
		setPendingDiffs,
		setShowDiffSummary,
        setUroborosProposal,
		mapHistoryToDisplayMessages,
		welcomeLockRef,
		viewRef,
		dropIncomingRef,
		lastUserAttachmentsRef,
        setLoadingStatus,
        setAutonomousMode,
		vscodeService
	};

    const generateId = () => {
        return 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    };

	const messageHandlerRegistryRef = useRef(createMessageHandlerRegistry(handlerContext));

	// Update handler context on state changes (handler functions remain stable via ref)
	useEffect(() => {
		messageHandlerRegistryRef.current = createMessageHandlerRegistry(handlerContext);
	}, [
		setSlashCommands,
		setCurrentProvider,
		setCurrentModel,
		setAvailableModels,
		setProfiles,
		setActiveProfileId,
		setSessions,
		setActiveSessionId,
		setMessages,
		setPlan,
		setStatusText,
		setIsThinking,
		setPendingDiffs,
		setShowDiffSummary,
		setUroborosProposal
	]);

	const handleExtensionMessage = useCallback((event: MessageEvent) => {
		const message = event.data;
		console.log('Received message from extension:', message);

		if (!message || typeof message.command !== 'string') {
			console.warn('[MainView] Invalid message format:', message);
			return;
		}

        // Session filtering: Ignore messages for other sessions (except global commands)
        if (message.sessionId && message.sessionId !== activeSessionId) {
            if (message.command !== 'historyList' && message.command !== 'requestInitialData') {
                console.log(`[MainView] Ignoring message for session ${message.sessionId} (active: ${activeSessionId})`);
                return;
            }
        }

		// Handle insertAttachment directly in MainView
		if (message.command === 'insertAttachment') {
			if (Array.isArray(message.payload)) {
				const incoming: any[] = message.payload.filter((x: any) => x && x.label);
				setAttachments(prev => {
					const byUri = new Map<string, any>();
					const pushOrMerge = (att: any) => {
						const key = `${att.type}:${att.uri || att.label}`;
						const existing = prev.find(p => (p.uri || p.label) === (att.uri || att.label) && p.type === att.type);
						if (!existing) {
							byUri.set(key, att);
							return;
						}
						byUri.set(key, { ...existing, ...att });
					};
					incoming.forEach(pushOrMerge);
					const merged = Array.from(byUri.values());
					return merged.length > 0 ? [...prev.filter(p => !byUri.has(`${p.type}:${p.uri || p.label}`)), ...merged] : prev;
				});
			}
			return;
		}

		// Use handler registry pattern (similar to toolRegistry in MCPServer)
		const handler = messageHandlerRegistryRef.current[message.command];
		if (handler) {
			handler(message.payload, handlerContext);
		} else {
			console.warn(`[MainView] No handler registered for command: ${message.command}`);
		}
	}, [handlerContext]);

	// Initialize message listener - only setup once
	useEffect(() => {
		window.addEventListener('message', handleExtensionMessage);
		return () => window.removeEventListener('message', handleExtensionMessage);
	}, [handleExtensionMessage]);

	// Send initial load messages only once on mount
	useEffect(() => {
		vscodeService.postMessage({ command: 'requestInitialData' });
		vscodeService.postMessage({ command: 'requestHistory' });
		vscodeService.postMessage({ command: 'getSlashCommands' });
		vscodeService.postMessage({ command: 'requestLlmSettings' });
		vscodeService.postMessage({ command: 'requestModels' });
		vscodeService.postMessage({ command: 'requestProfiles' });

		// Safety timeout: force-clear loading overlay after 5s
		const loadingTimeout = setTimeout(() => {
			setLoadingStatus({ llmSettings: false, models: false, profiles: false, slashCommands: false });
		}, 5000);
		return () => clearTimeout(loadingTimeout);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []); // 빈 의존성 배열로 마운트 시 한 번만 실행
useEffect(() => {
    const container = mainViewRef.current;
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}, [messages, pendingDiffs]);

    const handleSendMessage = (messageText: string) => {
    const sendingFromWelcome = (view === 'welcome');
    if (view !== 'chat') setView('chat');
    welcomeLockRef.current = false;
    setError(null);
    setPlan([]);
    setIsThinking(true);
    dropIncomingRef.current = true;
    const tempId = generateId();
    if (sendingFromWelcome) {
        setShowHistoryPanel(false);
        setMessages([]);
        vscodeService.postMessage({ command: 'newChat', initialQuery: messageText, attachments, messageId: tempId });
    } else {
        vscodeService.postMessage({ command: 'userQuery', query: messageText, attachments, messageId: tempId });
    }
    try { lastUserAttachmentsRef.current = Array.isArray(attachments) ? [...attachments] : []; } catch {}
    const displayText = String(messageText || '').replace(/\r\n/g, '\n').split('\n').join('  \n');
    setMessages(prev => [...prev, { sender: 'user', text: displayText, attachments, timestamp: new Date().toISOString(), senderName: 'User', messageId: tempId }]);
    setAttachments([]);
};
const handleNewChat = () => {
    setView('welcome');
    welcomeLockRef.current = true;
    setError(null);
    setShowHistoryPanel(false);
    setMessages([]);
    setPlan([]);
    setIsThinking(false);
    setActiveSessionId(''); // Clear active session ID
    dropIncomingRef.current = true;
    
    // Notify backend to clear internal active session state
    vscodeService.postMessage({ command: 'deselectChat' });

    // Don't create new session yet - wait for user to send first message
    // Session will be created in handleSendMessage when sendingFromWelcome is true
};

	const handleShowHistory = () => {
    setShowHistoryPanel(prev => !prev);
    if (!showHistoryPanel) {
        vscodeService.postMessage({ command: 'requestHistory' });
    }
};

	const handleToggleAutonomousMode = (checked: boolean) => {
    setAutonomousMode(checked);
    vscodeService.postMessage({ command: 'setAutonomousMode', enabled: checked });
};

	const handleSelectSession = (sessionId: string) => {
    welcomeLockRef.current = false;
    if (sessionId === activeSessionId && view === 'chat') {
        setShowHistoryPanel(false);
        return;
    }
    setShowHistoryPanel(false);
    setView('chat');
    setError(null);
    setMessages([]);
    setPlan([]);
    setIsThinking(false);
    vscodeService.postMessage({ command: 'selectChat', sessionId });
};

	const handleDeleteSession = (sessionId: string) => {
    vscodeService.postMessage({ command: 'deleteChat', sessionId });
};

	const renderHistoryPanel = () => {
		if (!showHistoryPanel) return null;
		return (
			<div className="history-panel">
				<div className="history-header">
					<button className="chevron-btn" onClick={handleShowHistory} aria-expanded={showHistoryPanel} title={showHistoryPanel ? 'Collapse' : 'Expand'}>
						<span className={`codicon ${showHistoryPanel ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
					</button>
					<span className="history-title">Chat History</span>
				</div>
				{sessions.length === 0 ? (
					<div className="history-empty">No chat history</div>
				) : (
					<ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
						{sessions.map(s => (
							<li key={s.id} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
								<button
									onClick={() => handleSelectSession(s.id)}
									style={{
										width: '100%',
										textAlign: 'left',
										background: (view === 'chat' && s.id === activeSessionId) ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
										color: (view === 'chat' && s.id === activeSessionId) ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-foreground)',
										border: '1px solid var(--vscode-panel-border)',
										borderRadius: 4,
										padding: '6px 32px 6px 8px',
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap',
										cursor: 'pointer'
									}}
									title={s.title}
								>
									<span>{s.title}</span>
									<span style={{ float: 'right', color: 'var(--vscode-descriptionForeground)' }}>
										{(() => {
											try {
												return new Date(s.createdAt).toLocaleString([], { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
											} catch {
												return '';
											}
										})()}
									</span>
								</button>
								<button
									onClick={() => handleDeleteSession(s.id)}
									title="Delete chat"
									aria-label={`Delete ${s.title}`}
									style={{
										position: 'absolute',
										right: '4px',
										top: '50%',
										transform: 'translateY(-50%)',
										border: 'none',
										background: 'transparent',
										color: 'var(--vscode-icon-foreground)',
										cursor: 'pointer',
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										padding: '6px',
										fontSize: '16px',
										lineHeight: 1,
										borderRadius: 4
									}}
								>
									&#x1F5D1;
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		);
	};

	const renderCentralContent = () => {
		if (view === 'settings') return <SettingsPage />;
		if (error) return <ErrorDisplay error={error} />;
		if (view === 'welcome') {
			const recent = [...sessions].reverse().slice(0, 2); // 최근 2개
			return <WelcomeScreen onSendMessage={handleSendMessage} recentSessions={recent} onPickSession={handleSelectSession} />;
		}
		return (
			<MessageList
				messages={messages}
				isThinking={isThinking}
                onAction={() => setIsThinking(true)}
                onRollback={(messageId, timestamp) => {
                    const confirmation = window.confirm('Are you sure you want to time travel to this message? All subsequent history will be lost.');
                    if (confirmation) {
                        vscodeService.postMessage({ command: 'rollbackTo', payload: { messageId, timestamp } });
                    }
                }}
			/>
		);
	};

        const renderDiffSummaryBar = () => {
            if (pendingDiffs.length === 0) return null;
            return (
                <div className="diff-summary-bar" ref={diffSummaryRef}>
                    <div className="diff-summary-header">
                        <button className="chevron-btn" onClick={() => setShowDiffSummary(v => !v)} aria-expanded={showDiffSummary} title={showDiffSummary ? 'Collapse' : 'Expand'}>
                            <span className={`codicon ${showDiffSummary ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
                        </button>
                        <span className="diff-summary-title">{pendingDiffs.length} Files</span>
                        <div className="diff-summary-actions">
                            <button className="diff-summary-btn" onClick={() => {
                                // Accept All
                                vscodeService.postMessage({ command: 'acceptAllChanges', payload: pendingDiffs.map(d => ({ filePath: d.filePath, originalCode: d.originalCode, modifiedCode: d.modifiedCode, suggestionType: d.suggestionType })) });
                            }}>Accept All</button>
                            <button className="diff-summary-btn secondary" onClick={() => {
                                vscodeService.postMessage({ command: 'declineAllChanges', payload: pendingDiffs.map(d => ({ filePath: d.filePath })) });
                                setPendingDiffs([]);
                                setShowDiffSummary(false);
                            }}>Reject All</button>
                        </div>
                    </div>
                    {showDiffSummary && (
                        <ul className="diff-file-list">
                            {pendingDiffs.map(d => {
                                const baseName = (d.filePath && d.filePath.split(/[\\/]/).pop()) || '';
                                const displayName = baseName || d.title || d.filePath;
                                return (
                                    <li key={d.filePath} className="diff-file-item" title={d.title}>
                                        <span className="file-title" onClick={() => {
                                            vscodeService.postMessage({ command: 'showDiff', originalCode: d.originalCode, modifiedCode: d.modifiedCode, title: d.title || d.filePath });
                                        }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span className="codicon codicon-file-code" />
                                            {displayName}
                                        </span>
                                        {typeof d.addedLines === 'number' && typeof d.removedLines === 'number' && (
                                            <span className="file-stats">
                                                <span className="file-stats-added">+{d.addedLines}</span>
                                                <span className="file-stats-removed">-{d.removedLines}</span>
                                            </span>
                                        )}
                                        <div className="file-actions">
                                            <button className="file-action-btn accept" title="Accept" onClick={() => {
                                                vscodeService.postMessage({ command: 'acceptChange', filePath: d.filePath, originalCode: d.originalCode, modifiedCode: d.modifiedCode, suggestionType: d.suggestionType });
                                                setPendingDiffs(prev => prev.filter(x => x.filePath !== d.filePath));
                                            }}>
                                                <span className="codicon codicon-check" />
                                            </button>
                                            <button className="file-action-btn reject" title="Reject" onClick={() => {
                                                vscodeService.postMessage({ command: 'declineChange', filePath: d.filePath });
                                                setPendingDiffs(prev => prev.filter(x => x.filePath !== d.filePath));
                                            }}>
                                                <span className="codicon codicon-close" />
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            );
        };

        // Simple context menu in main viper for sending file to Viper
        const [ctxMenu, setCtxMenu] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });
        const onMainViewContextMenu = (e: React.MouseEvent) => {
            e.preventDefault();
            setCtxMenu({ visible: true, x: e.clientX, y: e.clientY });
        };
        const hideCtxMenu = () => setCtxMenu(v => ({ ...v, visible: false }));

        const activeProfile = profiles.find(p => p.id === activeProfileId);
        const modelTooltip = (() => {
            const baseName = (currentModel || activeProfile?.model || '').trim();
            if (!baseName) return undefined as string | undefined;
            const overrides = Array.isArray((activeProfile as any)?.agentOverrides) ? (activeProfile as any).agentOverrides : [];
            const hasOverrides = overrides.some((o: any) => o && !o.useDefault && typeof o.model === 'string' && o.model.trim());

            // If "ollama custom" is displayed (has overrides), show agent-specific models
            if (hasOverrides) {
                const lines: string[] = [];
                overrides.forEach((o: any) => {
                    if (!o || o.useDefault || typeof o.model !== 'string' || !o.model.trim()) {
                        return;
                    }
                    const rawName = String(o.agentName || '').trim();
                    if (!rawName) return;
                    // Remove "Agent" suffix and capitalize first letter
                    const short = rawName.replace(/Agent$/i, '') || rawName;
                    const capitalized = short.charAt(0).toUpperCase() + short.slice(1);
                    lines.push(`${capitalized}: ${o.model.trim()}`);
                });
                return lines.length > 0 ? lines.join('\n') : undefined;
            }

            // Otherwise, show profile and base model
            const profileLabel = activeProfile?.name && activeProfile.name !== 'Profile' ? activeProfile.name : undefined;
            return profileLabel ? `${profileLabel}: ${baseName}` : baseName;
        })();

        // Calculate if still loading initial data
        const isLoading = loadingStatus.llmSettings || loadingStatus.models || loadingStatus.profiles || loadingStatus.slashCommands;

        return (
            <div className="app-container">
                <Header
                    onNewChat={handleNewChat}
                    onShowHistory={handleShowHistory}
                    onShowSettings={() => {
                        setView(prev => {
                            if (prev === 'settings') {
                                // Return to previous view (welcome or chat) based on active session
                                return activeSessionId ? 'chat' : 'welcome';
                            }
                            // Enter settings
                            setPlan([]);
                            return 'settings';
                        });
                    }}
                    isAutonomousMode={isAutonomousMode}
                    onToggleAutonomousMode={handleToggleAutonomousMode}
                    model={currentModel}
                    models={availableModels}
                    modelTooltip={modelTooltip}
                    profiles={profiles.map(p => ({ id: p.id, name: p.name }))}
                    activeProfileId={activeProfileId}
                    onChangeModel={(m) => {
                        setCurrentModel(m);
                        vscodeService.postMessage({ command: 'setModel', payload: { model: m } });
                    }}
                    onChangeProfile={(id) => {
                        setActiveProfileId(id);
                        vscodeService.postMessage({ command: 'setActiveProfile', payload: { id } });
                        // After setting active profile, also refresh settings/models
                        vscodeService.postMessage({ command: 'requestLlmSettings' });
                        vscodeService.postMessage({ command: 'requestModels' });
                    }}
                />

                {renderHistoryPanel()}
                {isLoading && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'var(--vscode-editor-background)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        gap: 16
                    }}>
                        <div style={{
                            width: 32,
                            height: 32,
                            border: '2px solid var(--vscode-progressBar-background)',
                            borderTop: '2px solid transparent',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                        }} />
                        <span style={{ color: 'var(--vscode-foreground)' }}>Loading...</span>
                        <style>{`
                            @keyframes spin {
                                0% { transform: rotate(0deg); }
                                100% { transform: rotate(360deg); }
                            }
                        `}</style>
                    </div>
                )}
                {view === 'chat' && (
                    <PlanView plan={plan} isAutonomousMode={isAutonomousMode} />
                )}
                {view !== 'settings' && !!statusText && !isThinking && (
                    <div className="agent-activity" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--vscode-panel-border)' }}>
                        <span className={`codicon codicon-info`} />
                        <span>{statusText}</span>
                    </div>
                )}
                <div className="main-view" ref={mainViewRef} onContextMenu={onMainViewContextMenu} onClick={hideCtxMenu} style={{ overflowY: (view === 'welcome' || (view === 'chat' && messages.length === 0)) ? 'hidden' : 'auto' }}>
                    {renderCentralContent()}
                </div>

                {ctxMenu.visible && (
                    <div className="vb-context-menu" style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 1000 }} onClick={hideCtxMenu}>
                        <div className="vb-context-item" onClick={() => {
                            // Trigger file picker UI by sending requestPick command
                            vscodeService.postMessage({ command: 'requestPick', payload: { kind: 'file' } });
                            hideCtxMenu();
                        }}>Send File to Viper</div>
                    </div>
                )}
                {view !== 'settings' && (
                    <>
                        {/* 입력창 바로 위에 diff 요약 바 표시 */}
                        {renderDiffSummaryBar()}
                        {/* Follow-ups trigger removed per product decision */}
                        <div className="input-area-container">
                            {/* Recent History (compact) above input. Exclude active and empty sessions */}
                            {(() => {
                                if (view !== 'welcome' && (messages || []).length > 0) return null;
                                // Show latest 2 sessions excluding active session
                                let list = (sessions || []);
                                // Only exclude active session if we are actually in a chat view (meaning we are looking at one).
                                // If we are in Welcome view, we should show the most recent ones regardless.
                                if (view === 'chat' && activeSessionId && messages.length > 0) {
                                    list = list.filter(s => s.id !== activeSessionId);
                                }
                                list = list.slice(-2).reverse();
                                if (list.length === 0) return null;
                                return (
                                    <div style={{ margin: '0 0 6px 0' }}>
                                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                                            {list.map(s => (
                                                <li key={s.id} style={{ width: '100%' }}>
                                                    <button
                                                        onClick={() => handleSelectSession(s.id)}
                                                        style={{
                                                            width: '100%',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            background: 'var(--vscode-input-background)',
                                                            color: 'var(--vscode-foreground)',
                                                            border: '1px solid var(--vscode-panel-border)',
                                                            borderRadius: 6,
                                                            padding: '6px 10px',
                                                            cursor: 'pointer',
                                                            textAlign: 'left'
                                                        }}
                                                        title={s.title}
                                                    >
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{s.title}</span>
                                                        <span style={{ color: 'var(--vscode-descriptionForeground)', flexShrink: 0, fontSize: '0.9em' }}>
                                                            {new Date(s.createdAt).toLocaleString([], { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })()}
                            <InputArea
                                onSendMessage={handleSendMessage}
                                disabled={isThinking}
                                commands={slashCommands}
                                attachments={attachments}
                                onRemoveAttachment={(label: string) => setAttachments(prev => prev.filter(a => a.label !== label))}
                                onClearAttachments={() => setAttachments([])}
                                isProcessing={isThinking}
                                onStop={() => {
                                    vscodeService.postMessage({ command: 'stop' });
                                }}
                            />
                        </div>
                    </>
                )}
            </div>
        );
    };