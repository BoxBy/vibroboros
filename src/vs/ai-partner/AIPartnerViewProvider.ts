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
	const isDevelopment = !!process.env.VITE_DEV_SERVER_URL;

	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'main.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'main.css'));
	const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'codicon.css'));
	const nonce = getNonce();

	const cspSource = webview.cspSource;
	let scriptSrc = `'nonce-${nonce}'`;
	let connectSrc = "'self'";

	if (isDevelopment) {
		const devServerUrl = process.env.VITE_DEV_SERVER_URL!;
		scriptSrc = `${devServerUrl} 'unsafe-eval'`;
		connectSrc = devServerUrl.replace(/^http/, 'ws');
	}

	const csp = [
		`default-src 'none'`,
		`style-src ${cspSource} 'unsafe-inline'`,
		`font-src ${cspSource}`,
		`img-src ${cspSource} https: data:`,
		`script-src ${scriptSrc}`,
		`connect-src ${connectSrc}`,
	].join('; ');

	return `<!DOCTYPE html>
            <html lang=\"en\">
            <head>
                <meta charset=\"UTF-8\">
                <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
                <meta http-equiv=\"Content-Security-Policy\" content=\"${csp}\">
                <link href=\"${styleUri}\" rel=\"stylesheet\">
                <link href=\"${codiconsUri}\" rel=\"stylesheet\" />
                <title>AI Partner</title>
                <style nonce=\"${nonce}\">
                    body, html {
                        height: 100%;
                        margin: 0;
                        padding: 0;
                        background-color: var(--vscode-side-bar-background);
                        color: var(--vscode-foreground);
                        font-family: var(--vscode-font-family);
                    }
                    #root {
                        height: 100%;
                    }
                    .loader-container {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100%;
                        text-align: center;
                    }
                    .loader {
                        border: 4px solid var(--vscode-input-background);
                        border-top: 4px solid var(--vscode-button-background);
                        border-radius: 50%;
                        width: 40px;
                        height: 40px;
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    .loading-text {
                        margin-top: 16px;
                        font-size: var(--vscode-font-size);
                    }
                </style>
            </head>
            <body>
                <div id=\"root\">
                    <div class=\"loader-container\">
                        <div class=\"loader\"></div>
                        <div class=\"loading-text\">Initializing AI Partner...</div>
                    </div>
                </div>
                <script type=\"module\" nonce=\"${nonce}\" src=\"${scriptUri}\"></script>
            </body>
            </html>`;
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

    public postMessage(message: any) {
        if (this._view) {
            this._view.webview.postMessage(message);
        } else {
            console.error('[AIPartnerViewProvider] Webview not available to post message.');
        }
    }
}
