import React from 'react';
import './styles.css';
export interface Message {
    sender: 'user' | 'ai';
    text: string;
    thought?: string;
}
export interface ChatViewProps {
    messages: Message[];
}
export declare const ChatView: React.FC<ChatViewProps>;
