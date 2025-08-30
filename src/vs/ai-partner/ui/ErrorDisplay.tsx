import React from 'react';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';
import './styles.css';

interface ErrorDisplayProps {
	error: { title: string; message: string; action?: { label: string; onClick: () => void; } };
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error }) => {
	return (
		<div className="error-container">
			<span className="codicon codicon-error"></span>
			<h3>{error.title}</h3>
			<p>{error.message}</p>
			{error.action && (
				<VSCodeButton onClick={error.action.onClick}>
					{error.action.label}
				</VSCodeButton>
			)}
		</div>
	);
};