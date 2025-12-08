import React from 'react';
interface HeaderProps {
    onNewChat: () => void;
    onShowHistory: () => void;
    onShowSettings: () => void;
    isAutonomousMode: boolean;
    onToggleAutonomousMode: (checked: boolean) => void;
}
export declare const Header: React.FC<HeaderProps>;
export {};
