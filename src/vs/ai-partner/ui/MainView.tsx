import * as React from 'react';
import { SettingsPage } from './SettingsPage';

declare const acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();

type ChatMessage = { author: 'user' | 'agent', content: any[] };
type Diagnostic = { source: string, filePath: string, issues: any[] };

interface MainViewState {
  mainInput: string;
  chatHistory: ChatMessage[];
  diagnostics: Diagnostic[];
  currentView: 'chat' | 'settings' | 'diagnostics';
  isFileProtectionEnabled: boolean;
}

export class MainView extends React.Component<{}, MainViewState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      mainInput: '',
      chatHistory: [],
      diagnostics: [],
      currentView: 'chat',
      isFileProtectionEnabled: true,
    };
  }

  componentDidMount() {
    window.addEventListener('message', this.handleExtensionMessage);
    vscode.postMessage({ command: 'loadSettings' });
  }

  componentWillUnmount() {
    window.removeEventListener('message', this.handleExtensionMessage);
  }

  private handleExtensionMessage = (event: MessageEvent) => {
    const message = event.data;
    switch (message.command) {
      case 'loadHistory':
        this.setState({ chatHistory: message.payload });
        break;
      case 'response':
        this.setState(prevState => ({
          chatHistory: [...prevState.chatHistory, message.payload]
        }));
        break;
      case 'loadSettingsResponse':
        this.setState({ isFileProtectionEnabled: message.payload.fileProtection === true });
        break;
      case 'add-diagnostic':
        this.setState(prevState => ({
          diagnostics: [...prevState.diagnostics, message.payload]
        }));
        break;
    }
  };

  private handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ mainInput: event.target.value });
  };

  private handleSendMessage = () => {
    const { mainInput } = this.state;
    if (!mainInput.trim()) return;
    vscode.postMessage({ command: 'askGeneralQuestion', query: mainInput });
    this.setState(prevState => ({
      chatHistory: [...prevState.chatHistory, { author: 'user', content: [{ type: 'text', text: mainInput }] }],
      mainInput: '',
    }));
  };

  private handleUiActionClick = (action: { toolName: string, arguments: any, label: string }) => {
    vscode.postMessage({ command: 'executeTool', payload: { toolName: action.toolName, arguments: action.arguments } });
    this.setState(prevState => ({
      chatHistory: [...prevState.chatHistory, { author: 'user', content: [{ type: 'text', text: `Clicked: "${action.label}"` }] }]
    }));
  };

  private handleFileProtectionToggle = () => {
    const newState = !this.state.isFileProtectionEnabled;
    this.setState({ isFileProtectionEnabled: newState });
    vscode.postMessage({ command: 'setFileProtection', payload: { enabled: newState } });
  }

  private renderContent = (contentItem: any, index: number) => {
    // ... (implementation remains the same)
  }

  private renderChatView() {
    // ... (implementation remains the same)
  }

  private renderDiagnosticsView() {
    const { diagnostics } = this.state;
    return (
      <div className="diagnostics-view">
        <h3>Proactive Analysis Findings</h3>
        {diagnostics.length === 0 ? (
          <p>No issues found yet. Issues will appear here as you save files.</p>
        ) : (
          diagnostics.map((diagnostic, index) => (
            <div key={index} className="diagnostic-item">
              <h4>{diagnostic.source} in {diagnostic.filePath}</h4>
              <ul>
                {diagnostic.issues.map((issue, issueIndex) => (
                  <li key={issueIndex}>
                    Line {issue.line}: {issue.description} - <code>{issue.code}</code>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    );
  }

  public render() {
    const { currentView, isFileProtectionEnabled } = this.state;
    return (
      <div className="main-view">
        <div className="navigation">
          <button onClick={() => this.setState({ currentView: 'chat' })} disabled={currentView === 'chat'}>Chat</button>
          <button onClick={() => this.setState({ currentView: 'diagnostics' })} disabled={currentView === 'diagnostics'}>Diagnostics</button>
          <button onClick={() => this.setState({ currentView: 'settings' })} disabled={currentView === 'settings'}>Settings</button>
          <div className="file-protection-toggle">
            <label htmlFor="file-protection">File Protection</label>
            <input type="checkbox" id="file-protection" checked={isFileProtectionEnabled} onChange={this.handleFileProtectionToggle} />
          </div>
        </div>
        {currentView === 'chat' && this.renderChatView()}
        {currentView === 'diagnostics' && this.renderDiagnosticsView()}
        {currentView === 'settings' && <SettingsPage />}
      </div>
    );
  }
}
