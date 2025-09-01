import React from 'react';
import { DisplayMessage } from './MainView';
import { MessageItem } from './MessageItem';
 
// ADDED: MainView로부터 받을 props 타입을 확장합니다.
interface MessageListProps {
	messages: DisplayMessage[];
	isThinking: boolean;
	showProgress: boolean;
	progressMessages: string[];
	onToggleProgress: () => void;
}
 
// MODIFIED: 새로운 props를 받도록 수정합니다.
export const MessageList: React.FC<MessageListProps> = ({ messages,
	isThinking,
	showProgress,
	progressMessages,
	onToggleProgress,
}) => {
	return (
		<div className="message-list">
			{messages.map((msg, index) => (
				<MessageItem key={index} message={msg} />
			))}
		</div>
	);
};