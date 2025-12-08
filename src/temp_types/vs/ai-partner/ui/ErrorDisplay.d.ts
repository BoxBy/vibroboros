import React from 'react';
import './styles.css';
interface ErrorDisplayProps {
    error: {
        title: string;
        message: string;
        action?: {
            label: string;
            onClick: () => void;
        };
    };
}
export declare const ErrorDisplay: React.FC<ErrorDisplayProps>;
export {};
