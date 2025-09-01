import React from 'react';
import { VSCodeCheckbox } from '@vscode/webview-ui-toolkit/react';

interface HeaderProps {
	onNewChat: () => void;
	onShowHistory: () => void;
	onShowSettings: () => void;
	isAutonomousMode: boolean;
	onToggleAutonomousMode: (checked: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({ onNewChat, onShowHistory, onShowSettings, isAutonomousMode, onToggleAutonomousMode }) => {
	return (
		<header className="header">
			<h1 className="header-title">AI Partner</h1>
			<div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
				<VSCodeCheckbox
					checked={isAutonomousMode}
					onChange={(e: any) => onToggleAutonomousMode(e.target.checked)}
					title="Toggle Autonomous Mode"
				>
					Autonomous
				</VSCodeCheckbox>
				<button onClick={onNewChat} title="New Chat">&#x270E;</button>
				<button onClick={onShowHistory} title="History">&#x23F2;</button>
				<button onClick={onShowSettings} title="Settings">&#x2699;</button>
			</div>
		</header>
	);
};