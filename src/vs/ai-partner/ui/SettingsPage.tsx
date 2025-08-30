import React from 'react';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';

export const SettingsPage: React.FC = () => {
  return (
    <div className="settings-page-container">
      <div className="settings-section">
        <h3>MCP Connectors</h3>
        <p>Manage your connections to Multi-Agent Communication Protocol (MCP) servers.</p>
        <VSCodeButton>Add MCP Connector</VSCodeButton>
      </div>
      {/* Future settings sections can be added here */}
    </div>
  );
};
