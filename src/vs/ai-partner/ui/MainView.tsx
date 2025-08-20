import * as React from 'react';
import { SettingsPage } from './SettingsPage';

declare const acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();

type ChatMessage = { author: 'user' | 'agent', content: any[] };

interface MainViewState {
  mainInput: string;
  chatHistory: ChatMessage[];
  currentView: 'chat' | 'settings';
}

export class MainView extends React.Component<{}, MainViewState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      mainInput: '',
      chatHistory: [],
      currentView: 'chat',
    };
  }

  componentDidMount() {
    window.addEventListener('message', this.handleExtensionMessage);
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

  private handleUiActionClick = (action: { command: string, payload: any, label: string }) => {
    vscode.postMessage({ command: action.command, ...action.payload });
    this.setState(prevState => ({
      chatHistory: [...prevState.chatHistory, { author: 'user', content: [{ type: 'text', text: `Clicked: "${action.label}"` }] }]
    }));
  };

  private renderContent = (contentItem: any, index: number) => {
    switch (contentItem.type) {
      case 'text':
        return <pre key={index}>{contentItem.text}</pre>;
      case 'ui-action':
        return <button key={index} onClick={() => this.handleUiActionClick(contentItem.action)}>{contentItem.action.label}</button>;
      default:
        return <pre key={index}>{JSON.stringify(contentItem, null, 2)}</pre>;
    }
  }

  private renderChatView() {
    return (
      <>
        <div className="chat-history">
          {this.state.chatHistory.map((message, msgIndex) => (
            <div key={msgIndex} className={`message ${message.author}`}>
              <strong>{message.author}:</strong>
              {message.content.map(this.renderContent)}
            </div>
          ))}
        </div>
        <div className="input-group">
          <input
            type="text"
            value={this.state.mainInput}
            onChange={this.handleInputChange}
            onKeyPress={(event) => event.key === 'Enter' && this.handleSendMessage()}
            placeholder="Ask a question or give an instruction..."
          />
          <button onClick={this.handleSendMessage}>Send</button>
        </div>
      </>
    );
  }

  public render() {
    const { currentView } = this.state;
    return (
      <div className="main-view">
        <div className="navigation">
          <button onClick={() => this.setState({ currentView: 'chat' })} disabled={currentView === 'chat'}>Chat</button>
          <button onClick={() => this.setState({ currentView: 'settings' })} disabled={currentView === 'settings'}>Settings</button>
        </div>
        {currentView === 'chat' ? this.renderChatView() : <SettingsPage />}
      </div>
    );
  }
}
