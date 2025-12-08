import React from 'react';
import { DisplayMessage } from './MainView';
import { MessageItem } from './MessageItem';

// ADDED: MainView로부터 받을 props 타입을 확장합니다.
interface MessageListProps {
    messages: DisplayMessage[];
    isThinking?: boolean;
    onAction?: () => void;
}

// MODIFIED: 새로운 props를 받도록 수정합니다.
export const MessageList: React.FC<MessageListProps> = ({ messages, isThinking, onAction }) => {
    return (
        <div className="message-list">
            {messages.map((msg, index) => (
                <MessageItem key={index} message={msg} onAction={onAction} />
            ))}
            {isThinking && (
                <div className="typing-indicator progress-log-item" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--vscode-descriptionForeground)', padding: '0 0 0 8px', margin: '0 0 4px 0', fontStyle: 'italic' }}>
                    <span className="codicon codicon-loading codicon-modifier-spin" />
                    <span>Viper is thinking...</span>
                </div>
            )}
        </div>
    );
};