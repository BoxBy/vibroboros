import * as vscode from 'vscode';
export declare class AIPartnerViewProvider implements vscode.WebviewViewProvider {
    private readonly _extensionUri;
    static readonly viewType = "viper.mainView";
    private _view?;
    private readonly _onDidReceiveMessage;
    readonly onDidReceiveMessage: vscode.Event<any>;
    constructor(_extensionUri: vscode.Uri);
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    postMessage(message: any): void;
}
