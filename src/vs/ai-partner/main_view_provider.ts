import * as vscode from 'vscode';
import { AgentCard, Task } from './core_data_structures';

/**
 * Manages the webview view for the AI Partner sidebar.
 */
export class MainViewProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = 'vibroboros.mainView';

    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'media')
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            if (data.command === 'executeSkill') {
                // This needs to be adapted to use the registered command IDs
                const commandId = `vibroboros.${data.skillId}`;
                vscode.commands.executeCommand(commandId);
            }
        });
    }

    /**
     * Sends a list of agent cards to the webview to be displayed.
     */
    public updateAgentCards(agentCards: AgentCard[]) {
        if (this._view) {
            this._view.show(true); // Make sure the view is visible
            this._view.webview.postMessage({ command: 'updateAgents', cards: agentCards });
        }
    }

    /**
     * Sends a single task update to the webview.
     */
    public updateTask(task: Task) {
        if (this._view) {
            this._view.webview.postMessage({ command: 'updateTask', task: task });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${stylesUri}" rel="stylesheet">
                <title>AI Partner</title>
            </head>
            <body>
                <h2>Active Tasks</h2>
                <div id="task-list-container"></div>

                <hr>

                <h2>Agents</h2>
                <div id="agent-list-container"></div>

                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
