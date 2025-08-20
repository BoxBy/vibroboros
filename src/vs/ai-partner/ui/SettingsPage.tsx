import * as React from 'react';

declare const acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();

interface SettingsPageState {
  mcpServerUrl: string;
  llmApiKey: string;
  status: string;
}

export class SettingsPage extends React.Component<{}, SettingsPageState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      mcpServerUrl: '',
      llmApiKey: '',
      status: 'Loading settings...'
    };
  }

  componentDidMount() {
    window.addEventListener('message', this.handleExtensionMessage);
    // Request settings from the extension host when the component loads.
    vscode.postMessage({ command: 'loadSettings' });
  }

  componentWillUnmount() {
    window.removeEventListener('message', this.handleExtensionMessage);
  }

  private handleExtensionMessage = (event: MessageEvent) => {
    const message = event.data;
    if (message.command === 'loadSettingsResponse') {
      this.setState({
        mcpServerUrl: message.payload.mcpServerUrl || 'http://localhost:3000',
        llmApiKey: message.payload.llmApiKey || '',
        status: 'Settings loaded.'
      });
    }
  };

  private handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    this.setState({ [name]: value } as any);
  };

  private handleSaveSettings = () => {
    const { mcpServerUrl, llmApiKey } = this.state;
    vscode.postMessage({
      command: 'saveSettings',
      payload: {
        mcpServerUrl,
        llmApiKey,
      }
    });
    this.setState({ status: 'Settings saved!' });
    setTimeout(() => this.setState({ status: '' }), 2000);
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
            placeholder="Enter your API key"
          />
        </div>

        <button onClick={this.handleSaveSettings}>Save Settings</button>
        {this.state.status && <p className="status-message">{this.state.status}</p>}
      </div>
    );
  }
}
