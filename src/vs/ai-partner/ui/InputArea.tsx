import React, { useState } from 'react';

interface InputAreaProps {
	onSendMessage: (message: string) => void;
}

export const InputArea: React.FC<InputAreaProps> = ({ onSendMessage }) => {
	const [message, setMessage] = useState('');

	const handleSend = () => {
		if (message.trim()) {
			onSendMessage(message);
			setMessage('');
		}
	};

	const handleKeyPress = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSend();
		}
	};

	// 텍스트 내용에 따라 textarea 높이를 동적으로 조절합니다.
	const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
		setMessage(event.target.value);
		const textarea = event.target;
		textarea.style.height = 'auto'; // 높이를 초기화
		textarea.style.height = `${textarea.scrollHeight}px`; // 스크롤 높이에 맞춰 설정
	};

	return (
		<div className="input-area">
      <textarea
		  value={message}
		  onInput={handleInput}
		  onKeyPress={handleKeyPress}
		  placeholder="메시지를 입력하세요..."
		  rows={1}
	  />
			<button onClick={handleSend} title="Send">
				<span>&#10148;</span>
			</button>
		</div>
	);
};