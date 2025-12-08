import React from 'react';
interface InputAreaProps {
    onSendMessage: (message: string) => void;
    disabled?: boolean;
    commands: {
        command: string;
        description: string;
    }[];
}
export declare const InputArea: React.FC<InputAreaProps>;
export {};
