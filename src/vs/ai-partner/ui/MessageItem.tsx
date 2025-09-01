import React, { useState } from 'react';
import { DisplayMessage } from './MainView';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

// ADDED: MessageList로부터 받을 props 타입을 확장합니다.
interface MessageItemProps {
	message: DisplayMessage;
	isLastMessage?: boolean;
	isThinking?: boolean;
	showProgress?: boolean;
	progressMessages?: string[];
	onToggleProgress?: () => void;
}

// MODIFIED: 새로운 props를 받도록 수정합니다.
export const MessageItem: React.FC<MessageItemProps> = ({
															message,
															isLastMessage,
															isThinking,
															showProgress,
															progressMessages,
															onToggleProgress,
														}) => {
	const [showThought, setShowThought] = useState(false);
	const isModel = message.sender === 'ai';

	return (
		<div className={`message ${isModel ? 'model-message' : 'user-message'}`}>

			{/* 기존의 'thought'를 보여주는 기능은 그대로 유지됩니다. */}
			{isModel && message.thought && (
				<div className="thought-container">
					<button
						className="show-process-button"
						onClick={() => setShowThought(!showThought)}
					>
						{showThought ? 'Hide process' : 'Show process'}
					</button>
					{showThought && (
						<pre className="thought-process">
                            <code>{message.thought}</code>
                        </pre>
					)}
				</div>
			)}

			<div className="message-content">
				<ReactMarkdown
					children={message.text}
					remarkPlugins={[remarkGfm]}
					components={{
						code({ node, inline, className, children, ...props }) {
							const match = /language-(\w+)/.exec(className || '');
							return !inline && match ? (
								<SyntaxHighlighter
									children={String(children).replace(/\n$/, '')}
									style={vscDarkPlus as any}
									language={match[1]}
									PreTag="div"
									{...props}
								/>
							) : (
								<code className={className} {...props}>
									{children}
								</code>
							);
						}
					}}
				/>

				{/* ADDED: 마지막 AI 메시지이고, 생각 중일 때만 Progress UI를 렌더링하는 로직 */}
				{isModel && isLastMessage && isThinking && (
					<div className="progress-container-inline">
						<button onClick={onToggleProgress} className="progress-toggle-button-inline">
							{showProgress ? 'Hide Progress' : 'Show Progress'}
						</button>
						{showProgress && (
							<div className="progress-content-inline">
								<ul>
									{progressMessages?.map((pMsg, pIndex) => (
										<li key={pIndex}>{pMsg}</li>
									))}
								</ul>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
};