import React, { useMemo } from 'react';
import { DisplayMessage } from './MainView';
import { MessageItem } from './MessageItem';

interface MessageListProps {
    messages: DisplayMessage[];
    isThinking?: boolean;
    onAction?: () => void;
    onRollback?: (messageId: string | undefined, timestamp: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, isThinking, onAction, onRollback }) => {
    // Group consecutive progress logs and specialist agent bubbles
    const groupedMessages = useMemo(() => {
        const result: any[] = [];
        let currentProgressGroup: any = null;
        let currentAgentGroup: any = null;

        messages.forEach((msg, idx) => {
            const isProgressMsg = msg.kind === 'progress';
            const isSpecialistAgent = msg.sender === 'ai' && 
                                     msg.senderName && 
                                     msg.senderName.trim() !== 'OrchestratorAgent' && 
                                     !isProgressMsg && 
                                     msg.kind !== 'task' && 
                                     msg.kind !== 'codeEditFile';
            
            // Collapse when: a user message OR a non-progress AI response follows
            const hasSubsequentMessage = messages.slice(idx + 1).some(m =>
                m.sender === 'user' || (m.sender === 'ai' && m.kind !== 'progress')
            );
            const hasSubsequentUserMessage = messages.slice(idx + 1).some(m => m.sender === 'user');

            if (isProgressMsg) {
                currentAgentGroup = null;
                if (!currentProgressGroup) {
                    currentProgressGroup = {
                        kind: 'progressGroup',
                        messages: [msg],
                        hasSubsequentUserMessage: hasSubsequentMessage,
                        timestamp: msg.timestamp,
                        sender: msg.sender
                    };
                    result.push(currentProgressGroup);
                } else {
                    currentProgressGroup.messages.push(msg);
                    // Update to the latest 'subsequent' status
                    currentProgressGroup.hasSubsequentUserMessage = hasSubsequentMessage;
                }
            } else if (isSpecialistAgent) {
                currentProgressGroup = null;
                if (!currentAgentGroup) {
                    currentAgentGroup = {
                        kind: 'agentGroup',
                        messages: [msg],
                        hasSubsequentUserMessage,
                        timestamp: msg.timestamp,
                        sender: msg.sender
                    };
                    result.push(currentAgentGroup);
                } else {
                    currentAgentGroup.messages.push(msg);
                    currentAgentGroup.hasSubsequentUserMessage = hasSubsequentUserMessage;
                }
            } else {
                currentProgressGroup = null;
                currentAgentGroup = null;
                result.push({ ...msg, hasSubsequentUserMessage });
            }
        });
        return result;
    }, [messages]);

    return (
        <div className="message-list">
            {groupedMessages.map((msg, index) => (
                <MessageItem 
                    key={index} 
                    message={msg} 
                    onAction={onAction} 
                    onRollback={onRollback} 
                    isLast={index === groupedMessages.length - 1}
                    isThinking={isThinking}
                    hasSubsequentUserMessage={msg.hasSubsequentUserMessage}
                />
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