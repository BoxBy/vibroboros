import React from 'react';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';
import './styles.css';

// onSendMessage 함수를 prop으로 받도록 타입을 정의합니다. (오류 9 해결 준비)
interface WelcomeScreenProps {
	onSendMessage: (message: string) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onSendMessage }) => {

	// 예시 프롬프트를 클릭하면 해당 텍스트로 대화를 시작하는 함수
	const handleExampleClick = (text: string) => {
		onSendMessage(text);
	};

	return (
		<div className="welcome-container">
			<div className="welcome-header">
				<h1>AI Partner</h1>
				{/* TODO: 나중에 설정 페이지 로직과 연결 */}
				<VSCodeButton appearance="icon" aria-label="Settings">
					<span className="codicon codicon-settings-gear"></span>
				</VSCodeButton>
			</div>
			<p className="welcome-subtitle">
				Your intelligent assistant for navigating and understanding your codebase. Start a conversation, ask a question, or try one of the examples below.
			</p>

			<div className="welcome-actions">
				{/* 각 액션 아이템을 클릭할 수 있도록 수정합니다. */}
				<div className="action-item" onClick={() => handleExampleClick("refactor this function to be more readable")}>
					<h3>Refactor Code</h3>
					<p>Open a file and type: <em>"refactor this function to be more readable"</em></p>
				</div>
				<div className="action-item" onClick={() => handleExampleClick("explain this code")}>
					<h3>Explain Code</h3>
					<p>Select a block of code and type: <em>"explain this code"</em></p>
				</div>
				<div className="action-item" onClick={() => handleExampleClick("add documentation to this function")}>
					<h3>Generate Documentation</h3>
					<p>Open a file with an undocumented function and type: <em>"add documentation to this function"</em></p>
				</div>
			</div>

			<p className="welcome-footer">
				Use '@' to mention specific <strong>files</strong> or symbols in your project.
			</p>
		</div>
	);
};