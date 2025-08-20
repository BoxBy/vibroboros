import * as React from 'react';

declare const acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();

type ChatMessage = { author: 'user' | 'agent', text: string };

interface MainViewState {
  inputValue: string;
  chatHistory: ChatMessage[];
}

export class MainView extends React.Component<{}, MainViewState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      inputValue: '',
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
    this.setState({ inputValue: event.target.value });
  };

  private handleSendMessage = () => {
    const { inputValue } = this.state;
    if (!inputValue.trim()) return;

    vscode.postMessage({
      command: 'searchWeb',
      query: inputValue,
    });

    // Optimistically add the user's message to the UI.
    // The agent will also save it to the persistent state.
    this.setState(prevState => ({
      chatHistory: [...prevState.chatHistory, { author: 'user', text: inputValue }],
      inputValue: '',
    }));
  };

  private handleAnalyzeFile = () => {
    vscode.postMessage({ command: 'analyzeActiveFile' });

    this.setState(prevState => ({
      chatHistory: [...prevState.chatHistory, { author: 'user', text: 'Analyze the active file' }]
    }));
  };

  public render() {
    return (
      <div className="main-view">
        <div className="action-buttons">
          <button onClick={this.handleAnalyzeFile}>Analyze Active File</button>
        </div>
        <div className="chat-history">
          {this.state.chatHistory.map((message, index) => (
            <div key={index} className={`message ${message.author}`}>
              <strong>{message.author}:</strong> <pre>{message.text}</pre>
            </div>
          ))}
        </div>
        <div className="chat-input-container">
          <input
            type="text"
            value={this.state.inputValue}
            onChange={this.handleInputChange}
            onKeyPress={(event) => event.key === 'Enter' && this.handleSendMessage()}
            placeholder="Ask the AI to search the web..."
          />
          <button onClick={this.handleSendMessage}>Send</button>
        </div>
      </div>
    );
  }
}
