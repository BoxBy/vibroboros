import React from 'react';
import { MessageList } from './MessageList';
import './styles.css';

// Message 타입에 optional 'thought' 속성을 추가합니다.
export interface Message {
	sender: 'user' | 'ai';
	text: string;
	thought?: string; // AI의 생각 과정을 담을 속성
}

export interface ChatViewProps {
	messages: Message[];
}

export const ChatView: React.FC<ChatViewProps> = ({ messages }) => {
	return (
		<div className="chat-view-container">
			<MessageList messages={messages} />
		</div>
	);
};