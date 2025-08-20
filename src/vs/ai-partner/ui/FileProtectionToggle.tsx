import * as React from 'react';

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
 * @class FileProtectionToggle
 * A reusable UI component that provides a toggle switch to protect a file
 * from being modified by the AI.
 */
export class FileProtectionToggle extends React.Component<FileProtectionToggleProps> {
  private handleToggle = () => {
    this.props.onToggle(this.props.filePath, !this.props.isProtected);
  };

  public render() {
    return (
      <div className="file-protection-toggle">
        <label htmlFor={`toggle-${this.props.filePath}`}>
          Protect file from AI modification
        </label>
        <input
          type="checkbox"
          id={`toggle-${this.props.filePath}`}
          checked={this.props.isProtected}
          onChange={this.handleToggle}
        />
      </div>
    );
  }
}
