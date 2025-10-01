import * as vscode from 'vscode';

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
	// ... (same as before)
}

export class AIPartnerViewProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = 'vibroboros.mainView';

    private _view?: vscode.WebviewView;

    private readonly _onDidReceiveMessage = new vscode.EventEmitter<any>();
    public readonly onDidReceiveMessage = this._onDidReceiveMessage.event;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
				vscode.Uri.joinPath(this._extensionUri, 'dist'),
            ],
        };

        webviewView.webview.html = getWebviewContent(webviewView.webview, this._extensionUri);

        const messageDisposable = webviewView.webview.onDidReceiveMessage(async (message) => {
            console.log('[AIPartnerViewProvider] Received message from UI:', message);
            this._onDidReceiveMessage.fire(message);
        });

        const visibilityDisposable = webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._onDidReceiveMessage.fire({ command: 'viewVisible' });
            }
        });

        webviewView.onDidDispose(() => {
            messageDisposable.dispose();
            visibilityDisposable.dispose();
        }, null);
    }

    public async handleConfirmationRequest(message: any) {
        const userChoice = await vscode.window.showInformationMessage(
            message.text,
            { modal: true },
            "Yes",
            "No"
        );
        this._onDidReceiveMessage.fire({ command: 'confirmation_response', choice: userChoice });
    }

    public postMessage(message: any) {
        if (message.command === 'confirmation_request') {
            this.handleConfirmationRequest(message);
            return;
        }

        if (this._view) {
            this._view.webview.postMessage(message);
        } else {
            console.error('[AIPartnerViewProvider] Webview not available to post message.');
        }
    }
}