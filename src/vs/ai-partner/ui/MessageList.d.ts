import React from 'react';
import { DisplayMessage } from './MainView';
interface MessageListProps {
    messages: DisplayMessage[];
    isThinking?: boolean;
}
export declare const MessageList: React.FC<MessageListProps>;
export {};
