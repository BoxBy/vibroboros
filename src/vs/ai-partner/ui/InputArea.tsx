import React, { useState, useEffect, useRef } from 'react';

interface InputAreaProps {
	onSendMessage: (message: string) => void;
}

export const InputArea: React.FC<InputAreaProps> = ({ onSendMessage }) => {
	const [message, setMessage] = useState('');
	const textareaRef = useRef<HTMLTextAreaElement>(null);

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

	// [수정] useEffect를 사용하여 메시지(값)가 변경될 때마다 높이를 재계산합니다.
	useEffect(() => {
		const textarea = textareaRef.current;
		if (textarea) {
			textarea.style.height = 'auto'; // 높이를 초기화하여 줄어들 수 있게 합니다.
			textarea.style.height = `${textarea.scrollHeight}px`; // 내용에 맞게 높이를 다시 설정합니다.
		}
	}, [message]);


	return (
		<div className="input-area">
            <textarea
				ref={textareaRef} // ref를 textarea에 연결합니다.
				value={message}
				onChange={(e) => setMessage(e.target.value)} // onChange로 상태만 업데이트합니다.
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