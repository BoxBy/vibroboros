import * as React from 'react';

/**
 * @interface SettingsPageState
 * Defines the state for the SettingsPage component.
 */
interface SettingsPageState {
  mcpServerUrl: string;
  llmApiKey: string;
}

/**
 * @class SettingsPage
 * A UI component for configuring the AI Partner's settings, such as the
 * MCP server connection and LLM API credentials.
 */
export class SettingsPage extends React.Component<{}, SettingsPageState> {
  constructor(props: {}) {
    super(props);
    // In a real implementation, these values would be loaded from VSCode's settings
    this.state = {
      mcpServerUrl: 'http://localhost:3000',
      llmApiKey: '',
    };
  }

  private handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    this.setState({ [name]: value } as any);
  };

  private handleSaveSettings = () => {
    // In a real implementation, this would save the settings to VSCode's configuration.
    console.log('Saving settings:', this.state);
  };

  public render() {
    return (
      <div className="settings-page">
        <h2>AI Partner Settings</h2>

        <div className="setting-group">
          <h3>Connectors</h3>
          <label htmlFor="mcpServerUrl">MCP Server URL:</label>
          <input
            type="text"
            id="mcpServerUrl"
            name="mcpServerUrl"
            value={this.state.mcpServerUrl}
            onChange={this.handleInputChange}
          />
        </div>

        <div className="setting-group">
          <h3>LLM Configuration</h3>
          <label htmlFor="llmApiKey">OpenAI-Compatible API Key:</label>
          <input
            type="password"
            id="llmApiKey"
            name="llmApiKey"
            value={this.state.llmApiKey}
            onChange={this.handleInputChange}
          />
        </div>

        <button onClick={this.handleSaveSettings}>Save Settings</button>
      </div>
    );
  }
}
