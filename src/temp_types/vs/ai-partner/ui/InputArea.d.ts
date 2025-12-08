import React from 'react';
interface InputAreaProps {
    onSendMessage: (message: string) => void;
    disabled?: boolean;
    commands: {
        command: string;
        description: string;
    }[];
    attachments?: Array<{
        type: 'file' | 'folder' | 'code' | 'mcp' | 'browser';
        uri?: string;
        label: string;
        content?: string;
    }>;
    onRemoveAttachment?: (label: string) => void;
    onClearAttachments?: () => void;
}
export declare const InputArea: React.FC<InputAreaProps>;
export {};
