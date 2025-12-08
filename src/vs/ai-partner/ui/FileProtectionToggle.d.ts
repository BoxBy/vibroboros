import React from 'react';
/**
 * @interface FileProtectionToggleProps
 * Defines the props for the FileProtectionToggle component.
 */
interface FileProtectionToggleProps {
    filePath: string;
    isProtected: boolean;
    onToggle: (filePath: string, isProtected: boolean) => void;
}
/**
 * @function FileProtectionToggle
 * A reusable UI component that provides a toggle switch to protect a file
 * from being modified by the AI.
 */
export declare const FileProtectionToggle: React.FC<FileProtectionToggleProps>;
export {};
