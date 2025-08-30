import React from 'react';

interface HeaderProps {
	onNewChat: () => void;
	onShowHistory: () => void;
	onShowSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onNewChat, onShowHistory, onShowSettings }) => {
	return (
		<header className="header">
			<h1 className="header-title">AI Partner</h1>
			<div className="header-actions">
				<button onClick={onNewChat} title="New Chat">
					&#x270E; {/* 연필 아이콘 */}
				</button>
				<button onClick={onShowHistory} title="History">
					&#x23F2; {/* 히스토리(시계) 아이콘 */}
				</button>
				<button onClick={onShowSettings} title="Settings">
					&#x2699; {/* 톱니바퀴 아이콘 */}
				</button>
			</div>
		</header>
	);
};