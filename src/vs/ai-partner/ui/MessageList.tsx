import React from 'react';
import { DisplayMessage } from './MainView';
import { MessageItem } from './MessageItem'; // 새로 만든 컴포넌트를 import 합니다.

interface MessageListProps {
	messages: DisplayMessage[];
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
	return (
		<div className="message-list">
			{/* 메시지 배열을 순회하며 각 메시지에 대해 MessageItem을 렌더링합니다. */}
			{messages.map((msg, index) => (
				<MessageItem key={index} message={msg} />
			))}
		</div>
	);
};