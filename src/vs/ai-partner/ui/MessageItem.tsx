import React, { useState } from 'react';
import { DisplayMessage } from './MainView';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

interface MessageItemProps {
	message: DisplayMessage;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
	const [showThought, setShowThought] = useState(false);
	const isModel = message.sender === 'ai';

	return (
		<div className={`message ${isModel ? 'model-message' : 'user-message'}`}>

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
			</div>
		</div>
	);
};