import * as vscode from 'vscode';
import { ConfigService } from './config_service';
import { LLMService } from './services/LLMService';
export declare class AIPartnerViewProvider implements vscode.WebviewViewProvider {
    private readonly _extensionUri;
    private readonly configService;
    private readonly llmService;
    static readonly viewType = "viper.mainView";
    private _view?;
    private readonly _onDidReceiveMessage;
    readonly onDidReceiveMessage: vscode.Event<any>;
    constructor(_extensionUri: vscode.Uri, configService: ConfigService, llmService: LLMService);
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    postMessage(message: any): void;
}
