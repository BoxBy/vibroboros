import React from 'react';
import './styles.css';

interface WelcomeScreenProps {
    onSendMessage: (message: string) => void;
    recentSessions?: Array<{ id: string; title: string; createdAt: string; messageCount: number }>;
    onPickSession?: (sessionId: string) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onSendMessage, recentSessions = [], onPickSession }) => {
    const handleExampleClick = (text: string) => {
        onSendMessage(text);
    };

    const title = 'Viper';
    const features: Array<{ title: string; desc: string; prompt: string; icon: string }> = [
        { title: 'Understand Code', desc: 'Summarize and explain selected code quickly.', prompt: 'Explain this code', icon: 'codicon-eye' },
        { title: 'Refactor & Improve', desc: 'Propose readability and performance improvements.', prompt: 'Refactor this function', icon: 'codicon-tools' },
        { title: 'Docs & Comments', desc: 'Generate concise documentation and comments.', prompt: 'Add comments to this function', icon: 'codicon-book' },
        { title: 'Tests & Analysis', desc: 'Create tests and run static checks for quality.', prompt: 'Write tests for this function', icon: 'codicon-beaker' }
    ];
    const footer = 'Attach with @file/@folder in the input, or via the editor context menu.';

    return (
        <div className="welcome-container" style={{ alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: 680, margin: '0 auto', textAlign: 'left' }}>
                <div className="welcome-header">
                    <h1>{title}</h1>
                </div>
                <p className="welcome-subtitle">
                    The Vibe-Coding Multi-Agent Partner. Focused on understanding, improving, and executing code without breaking your flow.
                </p>

                <div className="welcome-actions">
                    {features.map((a, idx) => (
                        <div key={idx} className="action-item" onClick={() => handleExampleClick(a.prompt)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span className={`codicon ${a.icon}`} style={{ fontSize: '16px', color: 'var(--vscode-textLink-foreground)' }} />
                                <h3>{a.title}</h3>
                            </div>
                            <p>{a.desc}</p>
                        </div>
                    ))}
                </div>

                <p className="welcome-footer">
                    {footer}
                </p>
            </div>
        </div>
    );
};