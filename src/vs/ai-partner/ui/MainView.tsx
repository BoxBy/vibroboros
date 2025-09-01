import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './Header';
import { SettingsPage } from './SettingsPage';
import { WelcomeScreen } from './WelcomeScreen';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { ErrorDisplay } from './ErrorDisplay';
import { PlanView, PlanStep } from './PlanView';
import { vscodeService } from './services/vscode';

export interface DisplayMessage {
	sender: 'user' | 'ai';
	text: string;
	thought?: string;
}

type ViewState = 'chat' | 'settings';

type ChatSessionMeta = {
	id: string;
	title: string;
	createdAt: string;
	messageCount: number;
};

export const MainView: React.FC = () => {
	const [view, setView] = useState<ViewState>('chat');
	const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
	const [activeSessionId, setActiveSessionId] = useState<string>('');
	const [messages, setMessages] = useState<DisplayMessage[]>([]);
	const [plan, setPlan] = useState<PlanStep[]>([]);
	const [error, setError] = useState<{ title: string, message: string } | null>(null);
	const [showHistoryPanel, setShowHistoryPanel] = useState(false);
	const [isAutonomousMode, setAutonomousMode] = useState(false);
	const [statusText, setStatusText] = useState<string | null>(null);
	const [progressMessages, setProgressMessages] = useState<string[]>([]);
	const [showProgress, setShowProgress] = useState(false);
	const [isThinking, setIsThinking] = useState(false);

	const mainViewRef = useRef<HTMLDivElement>(null);

	// handleExtensionMessage, useEffect, mapHistoryToDisplayMessages 등 다른 함수들은 모두 동일하게 유지합니다.
	// ... (이전 답변에 있던 함수들 그대로) ...
	useEffect(() => {
		const container = mainViewRef.current;
		if (container) {
			container.scrollTop = container.scrollHeight;
		}
	}, [messages, plan, progressMessages]);

	const mapHistoryToDisplayMessages = (history: any[]): DisplayMessage[] => {
		if (!Array.isArray(history)) return [];
		return history.map((msg: any) => {
			const sender: 'user' | 'ai' = msg.author === 'user' ? 'user' : 'ai';
			let text = '';
			if (Array.isArray(msg.content)) {
				text = msg.content
					.filter((c: any) => c && (c.text || c.type === 'text'))
					.map((c: any) => typeof c === 'string' ? c : (c.text ?? ''))
					.filter((t: string) => !!t)
					.join('\n');
			}
			return { sender, text };
		});
	};

	const handleExtensionMessage = useCallback((event: MessageEvent) => {
		const message = event.data;
		console.log('Received message from extension:', message);

		switch (message.command) {
			case 'analysis':
				setIsThinking(true);
				setProgressMessages(prev => [...prev, message.payload.text]);
				break;
			case 'displayPlan':
				setIsThinking(true);
				setPlan(message.payload.plan || []);
				break;
			case 'updatePlanStep':
				setPlan(prevPlan => {
					const newPlan = [...prevPlan];
					const { index, status } = message.payload;
					if (newPlan[index]) {
						newPlan[index].status = status;
					}
					return newPlan;
				});
				break;
			case 'statusUpdate':
				setStatusText(message.payload.text);
				break;
			case 'responseStart':
				setStatusText(null);
				setPlan([]);
				setMessages(prev => [...prev, { sender: 'ai', text: '' }]);
				setIsThinking(true);
				break;
			case 'responseChunk':
				setMessages(prev => {
					if (prev.length === 0 || prev[prev.length - 1].sender !== 'ai') {
						return [...prev, { sender: 'ai', text: message.payload.text }];
					}
					const newMessages = [...prev];
					const lastMessage = { ...newMessages[newMessages.length - 1] };
					lastMessage.text += message.payload.text;
					newMessages[newMessages.length - 1] = lastMessage;
					return newMessages;
				});
				break;
			case 'responseEnd':
				setStatusText(null);
				setIsThinking(false);
				setMessages(prev => {
					if (prev.length === 0 || prev[prev.length - 1].sender !== 'ai') return prev;
					const newMessages = [...prev];
					const lastMessage = { ...newMessages[newMessages.length - 1] };
					if (message.payload.thought) {
						lastMessage.thought = message.payload.thought;
					}
					newMessages[newMessages.length - 1] = lastMessage;
					return newMessages;
				});
				break;
			case 'response':
				setStatusText(null);
				setPlan([]);
				setIsThinking(false);
				if (message.payload) {
					setMessages(prev => [...prev, {
						sender: 'ai',
						text: message.payload.text,
						thought: message.payload.thought
					}]);
				}
				break;
			case 'loadHistory':
				if (message.payload) {
					const restored = mapHistoryToDisplayMessages(message.payload);
					setMessages(restored);
					setPlan([]);
					setProgressMessages([]);
					setError(null);
					setView('chat');
				}
				break;
			case 'historyList':
				if (message.payload) {
					setSessions(message.payload.sessions || []);
					setActiveSessionId(message.payload.activeId || '');
				}
				break;
			case 'displayError':
				setStatusText(null);
				setPlan([]);
				setIsThinking(false);
				setError({ title: 'Error', message: message.payload.message });
				break;
			case 'fullSettingsResponse':
				if (typeof message.payload.isLoopModeActive === 'boolean') {
					setAutonomousMode(message.payload.isLoopModeActive);
				}
				break;
			case 'loopModeChanged':
				if (typeof message.payload === 'boolean') {
					setAutonomousMode(message.payload);
				}
				break;
		}
	}, []);

	useEffect(() => {
		window.addEventListener('message', handleExtensionMessage);
		vscodeService.postMessage({ command: 'loadInitialData' });
		vscodeService.postMessage({ command: 'requestHistory' });

		return () => window.removeEventListener('message', handleExtensionMessage);
	}, [handleExtensionMessage]);

	const handleSendMessage = (messageText: string) => {
		if (view !== 'chat') setView('chat');
		setError(null);
		setPlan([]);
		setProgressMessages([]);
		setIsThinking(true);
		setMessages(prev => [...prev, { sender: 'user', text: messageText }]);
		vscodeService.postMessage({ command: 'userQuery', query: messageText });
	};

	const handleToggleProgress = () => {
		setShowProgress(prev => !prev);
	};

	const handleNewChat = () => {
		setView('chat');
		setError(null);
		setShowHistoryPanel(false);
		setMessages([]);
		setPlan([]);
		setProgressMessages([]);
		setIsThinking(false);
		vscodeService.postMessage({ command: 'newChat' });
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
		if (sessionId === activeSessionId) {
			setShowHistoryPanel(false);
			return;
		}
		setShowHistoryPanel(false);
		setView('chat');
		setError(null);
		setMessages([]);
		setPlan([]);
		setProgressMessages([]);
		setIsThinking(false);
		vscodeService.postMessage({ command: 'selectChat', sessionId });
	};

	const handleDeleteSession = (sessionId: string) => {
		vscodeService.postMessage({ command: 'deleteChat', sessionId });
	};

	const renderHistoryPanel = () => {
		if (!showHistoryPanel) return null;
		return (
			<div className="history-panel" style={{ padding: 8, borderBottom: '1px solid var(--vscode-panel-border)', background: 'var(--vscode-side-bar-background)' }}>
				<div style={{ fontWeight: 600, marginBottom: 6 }}>Chat History</div>
				{sessions.length === 0 ? (
					<div style={{ opacity: 0.8 }}>No chats yet.</div>
				) : (
					<ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
						{sessions.map(s => (
							<li key={s.id} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
								<button
									onClick={() => handleSelectSession(s.id)}
									style={{
										width: '100%',
										textAlign: 'left',
										background: s.id === activeSessionId ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
										color: s.id === activeSessionId ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-foreground)',
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
									{s.title} {s.messageCount ? `(${s.messageCount})` : ''}
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
		if (messages.length === 0 && plan.length === 0 && !isThinking) return <WelcomeScreen onSendMessage={handleSendMessage} />;

		return (
			<>
				<PlanView plan={plan} />
				<MessageList
					messages={messages}
					isThinking={isThinking}
					showProgress={showProgress}
					progressMessages={progressMessages}
					onToggleProgress={handleToggleProgress}
				/>
			</>
		);
	};

	return (
		<div className="app-container">
			<Header
				onNewChat={handleNewChat}
				onShowHistory={handleShowHistory}
				onShowSettings={() => setView(v => (v === 'settings' ? 'chat' : 'settings'))}
				isAutonomousMode={isAutonomousMode}
				onToggleAutonomousMode={handleToggleAutonomousMode}
			/>
			{renderHistoryPanel()}
			<div className="main-view" ref={mainViewRef}>
				{renderCentralContent()}
			</div>
			{view !== 'settings' && (
				<div className="input-area-container">
					{/* 이 영역에 있던 Progress UI는 삭제되었습니다. */}
					{statusText && !isThinking && (
						<div className="status-update">
							{statusText}
						</div>
					)}
					<InputArea onSendMessage={handleSendMessage} disabled={isThinking} />
				</div>
			)}
		</div>
	);
};