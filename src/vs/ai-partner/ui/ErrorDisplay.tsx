import React from 'react';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';
import './styles.css';

interface ErrorDisplayProps {
	error: { title: string; message: string; action?: { label: string; onClick: () => void; } };
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error }) => {
	return (
		<div className="error-container" style={{
            border: '1px solid var(--vscode-errorForeground)',
            backgroundColor: 'var(--vscode-inputValidation-errorBackground)',
            padding: '16px',
            borderRadius: '6px',
            margin: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--vscode-errorForeground)' }}>
			    <span className="codicon codicon-error" style={{ fontSize: '18px' }}></span>
			    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{error.title}</h3>
            </div>
			<p style={{ margin: 0, lineHeight: '1.4' }}>{error.message}</p>
			{error.action && (
				<div style={{ marginTop: '8px' }}>
                    <VSCodeButton onClick={error.action.onClick} appearance="secondary">
                        {error.action.label}
                    </VSCodeButton>
                </div>
			)}
		</div>
	);
};