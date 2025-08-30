import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './Header';
import { SettingsPage } from './SettingsPage';
import { WelcomeScreen } from './WelcomeScreen';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { ErrorDisplay } from './ErrorDisplay';
import { vscodeService } from './services/vscode';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';

// DisplayMessage와 ChatSession 타입 정의는 그대로 둡니다.
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
	const [error, setError] = useState<{ title: string, message: string } | null>(null);
	const [showHistoryPanel, setShowHistoryPanel] = useState(false);

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
			case 'response':
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
				setError({ title: 'Error', message: message.payload.message });
				break;
		}
	}, []);

	useEffect(() => {
		window.addEventListener('message', handleExtensionMessage);
		vscodeService.postMessage({ command: 'loadInitialData' });
		vscodeService.postMessage({ command: 'requestHistory' }); // 세션 목록 요청

		return () => window.removeEventListener('message', handleExtensionMessage);
	}, [handleExtensionMessage]);

	const handleSendMessage = (messageText: string) => {
		if (view !== 'chat') setView('chat');
		setError(null);
		setMessages(prev => [...prev, { sender: 'user', text: messageText }]);
		vscodeService.postMessage({ command: 'userQuery', query: messageText });
	};

	const handleNewChat = () => {
		setView('chat');
		setError(null);
		setShowHistoryPanel(false);
		setMessages([]); // UI 즉시 클리어
		vscodeService.postMessage({ command: 'newChat' });
	};

	const handleShowHistory = () => {
		setShowHistoryPanel(prev => !prev);
		if (!showHistoryPanel) {
			vscodeService.postMessage({ command: 'requestHistory' });
		}
	};

	const handleSelectSession = (sessionId: string) => {
		if (sessionId === activeSessionId) {
			setShowHistoryPanel(false);
			return;
		}
		setShowHistoryPanel(false);
		setView('chat');
		setError(null);
		setMessages([]); // UI 즉시 클리어
		vscodeService.postMessage({ command: 'selectChat', sessionId });
	};

	// 삭제 로직은 UI에서 상태를 직접 조작하지 않고 백엔드로 요청만 보냅니다.
	// 백엔드는 세션을 삭제한 후, 갱신된 세션 목록을 'historyList'로 다시 보내줍니다.
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

								{/* [수정] VSCodeButton을 유니코드 문자를 사용하는 일반 button으로 교체합니다. */}
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
										fontSize: '1.2em', // 아이콘 크기 조절
										borderRadius: 4
									}}
								>
									&#x1F5D1; {/* 휴지통 아이콘 유니코드 */}
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
		if (messages.length === 0) return <WelcomeScreen onSendMessage={handleSendMessage} />;
		return <MessageList messages={messages} />;
	};

	return (
		<div className="app-container">
			<Header onNewChat={handleNewChat} onShowHistory={handleShowHistory} onShowSettings={() => setView(v => (v === 'settings' ? 'chat' : 'settings'))} />
			{renderHistoryPanel()}
			<div className="main-view">
				{renderCentralContent()}
			</div>
			{view !== 'settings' && (
				<div className="input-area-container">
					<InputArea onSendMessage={handleSendMessage} />
				</div>
			)}
		</div>
	);
};