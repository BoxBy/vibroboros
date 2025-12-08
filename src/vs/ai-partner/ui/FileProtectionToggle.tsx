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
export const FileProtectionToggle: React.FC<FileProtectionToggleProps> = ({ filePath, isProtected, onToggle }) => {
  const handleToggle = () => {
    onToggle(filePath, !isProtected);
  };

  return (
    <div className="file-protection-toggle">
      <label htmlFor={`toggle-${filePath}`}>
        Protect file from AI modification
      </label>
      <input
        type="checkbox"
        id={`toggle-${filePath}`}
        checked={isProtected}
        onChange={handleToggle}
      />
    </div>
  );
};
