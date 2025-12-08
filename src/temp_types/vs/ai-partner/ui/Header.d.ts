import React from 'react';
interface HeaderProps {
    onNewChat: () => void;
    onShowHistory: () => void;
    onShowSettings: () => void;
    isAutonomousMode: boolean;
    onToggleAutonomousMode: (checked: boolean) => void;
    model?: string;
    models?: string[];
    onChangeModel?: (model: string) => void;
    profiles?: Array<{
        id: string;
        name: string;
    }>;
    activeProfileId?: string | null;
    onChangeProfile?: (profileId: string) => void;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    } | null;
}
export declare const Header: React.FC<HeaderProps>;
export {};
