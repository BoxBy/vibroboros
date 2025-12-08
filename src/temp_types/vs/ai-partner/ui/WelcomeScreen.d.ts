import React from 'react';
import './styles.css';
interface WelcomeScreenProps {
    onSendMessage: (message: string) => void;
    recentSessions?: Array<{
        id: string;
        title: string;
        createdAt: string;
        messageCount: number;
    }>;
    onPickSession?: (sessionId: string) => void;
}
export declare const WelcomeScreen: React.FC<WelcomeScreenProps>;
export {};
