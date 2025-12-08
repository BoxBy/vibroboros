import React from 'react';
export interface DisplayMessage {
    sender: 'user' | 'ai';
    text: string;
    thought?: string;
    diff?: {
        diffHtml: string;
        originalCode: string;
        modifiedCode: string;
        title: string;
        filePath: string;
        suggestionType: string;
    };
}
export declare const MainView: React.FC;
