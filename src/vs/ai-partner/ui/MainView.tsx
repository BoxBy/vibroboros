import * as React from 'react';

declare const acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();

type ChatMessage = { author: 'user' | 'agent', text: string };

interface MainViewState {
  webSearchInput: string;
  terminalCommandInput: string;
  chatHistory: ChatMessage[];
}

export class MainView extends React.Component<{}, MainViewState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      webSearchInput: '',
      terminalCommandInput: '',
      chatHistory: [],
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
    const { name, value } = event.target;
    this.setState({ [name]: value } as any);
  };

  private handleSendMessage = () => {
    const { webSearchInput } = this.state;
    if (!webSearchInput.trim()) return;
    vscode.postMessage({ command: 'searchWeb', query: webSearchInput });
    this.setState(prevState => ({
      chatHistory: [...prevState.chatHistory, { author: 'user', text: `Search for: ${webSearchInput}` }],
      webSearchInput: '',
    }));
  };

  private handleAnalyzeFile = () => {
    vscode.postMessage({ command: 'analyzeActiveFile' });
    this.setState(prevState => ({
      chatHistory: [...prevState.chatHistory, { author: 'user', text: 'Analyze the active file' }]
    }));
  };

  private handleGitStatus = () => {
    vscode.postMessage({ command: 'gitStatus' });
    this.setState(prevState => ({
      chatHistory: [...prevState.chatHistory, { author: 'user', text: 'Get Git status' }]
    }));
  };

  private handleRunTerminalCommand = () => {
    const { terminalCommandInput } = this.state;
    if (!terminalCommandInput.trim()) return;
    vscode.postMessage({ command: 'runTerminalCommand', commandString: terminalCommandInput });
    this.setState(prevState => ({
      chatHistory: [...prevState.chatHistory, { author: 'user', text: `Run: ${terminalCommandInput}` }],
      terminalCommandInput: '',
    }));
  };

  public render() {
    return (
      <div className="main-view">
        <div className="action-buttons">
          <button onClick={this.handleAnalyzeFile}>Analyze Active File</button>
          <button onClick={this.handleGitStatus}>Git Status</button>
        </div>
        <div className="chat-history">
          {this.state.chatHistory.map((message, index) => (
            <div key={index} className={`message ${message.author}`}>
              <strong>{message.author}:</strong> <pre>{message.text}</pre>
            </div>
          ))}
        </div>
        <div className="input-group">
          <input
            name="webSearchInput"
            type="text"
            value={this.state.webSearchInput}
            onChange={this.handleInputChange}
            placeholder="Ask the AI to search the web..."
          />
          <button onClick={this.handleSendMessage}>Search</button>
        </div>
        <div className="input-group">
          <input
            name="terminalCommandInput"
            type="text"
            value={this.state.terminalCommandInput}
            onChange={this.handleInputChange}
            onKeyPress={(event) => event.key === 'Enter' && this.handleRunTerminalCommand()}
            placeholder="Enter a terminal command..."
          />
          <button onClick={this.handleRunTerminalCommand}>Run Command</button>
        </div>
      </div>
    );
  }
}
