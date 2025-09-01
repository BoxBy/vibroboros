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
export const MessageList: React.FC<MessageListProps> = ({
															messages,
															isThinking,
															showProgress,
															progressMessages,
															onToggleProgress,
														}) => {
	return (
		<div className="message-list">
			{messages.map((msg, index) => {
				// MODIFIED: 현재 렌더링하는 메시지가 마지막 메시지인지 확인합니다.
				const isLastMessage = index === messages.length - 1;

				return (
					<MessageItem
						key={index}
						message={msg}
						// ADDED: 마지막 메시지일 경우에만 Progress 관련 props를 전달합니다.
						isLastMessage={isLastMessage}
						isThinking={isLastMessage ? isThinking : false}
						showProgress={isLastMessage ? showProgress : false}
						progressMessages={isLastMessage ? progressMessages : []}
						onToggleProgress={isLastMessage ? onToggleProgress : ()=> {}}
					/>
				);
			})}
		</div>
	);
};