import * as vscode from 'vscode';
import { ConfigService } from './config_service';
import { LLMService } from './services/LLMService';
import { A2AMessage, A2A_MIME_TYPES, createProgressMessage, createPlanMessage, createFileEditMessage, createA2ADataMessage, PlanData, FileEditData } from './types/A2AMessages';

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
		`style-src ${cspSource} 'unsafe-inline' https://cdnjs.cloudflare.com`, // cdnjs.cloudflare.com 추가
		`font-src ${cspSource}`,
		`img-src ${cspSource} https: data:`,
		`script-src ${cspSource} ${scriptSrc} https://cdnjs.cloudflare.com`, // Allow local webview resources and cdnjs
		`connect-src ${cspSource} ${connectSrc}`,
	].join('; ');

	return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="${csp}">
                <link href="${styleUri}" rel="stylesheet">
                <link href="${codiconsUri}" rel="stylesheet" />
                <!-- diff2html CSS 및 JS 추가 -->
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/diff2html/3.4.47/diff2html.min.css" />
                <script src="https://cdnjs.cloudflare.com/ajax/libs/diff2html/3.4.47/diff2html.min.js"></script>
                <title>Viper</title>
                <style nonce="${nonce}">
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
                    .action-buttons {
                        display: flex;
                        gap: 10px; /* 버튼 사이의 간격을 10px로 설정 */
                        margin-top: 10px; /* 버튼 그룹 위에 여백 추가 */
                        flex-wrap: wrap; /* 버튼이 많아지면 줄바꿈되도록 설정 */
                    }
                    /* Base styles for all buttons */
                    .action-btn {
                        padding: 8px 15px;
                        border: 1px solid transparent; /* Default border */
                        border-radius: 5px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 600;
                        text-align: center;
                    }

                    /* 1. Primary Button: "Accept" */
                    .accept-btn {
                        background-color: var(--vscode-editor-background); /* 배경을 중립적으로 변경 */
                        color: var(--vscode-button-foreground);
                        border-color: var(--vscode-button-background); /* 테두리로 강조 */
                    }
                    .accept-btn:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }

                    /* 2. Destructive/Warning Button: "Decline" */
                    .decline-btn {
                        background-color: var(--vscode-editor-background);
                        color: var(--vscode-foreground); /* 텍스트 색상을 덜 강하게 변경 */
                        border: 1px solid var(--vscode-errorForeground);
                    }
                    .decline-btn:hover {
                        background-color: var(--vscode-errorForeground);
                        color: var(--vscode-editor-background);
                    }

                    /* 3. Secondary Button: "Accept (Always)" */
                    .accept-always-btn {
                        background-color: var(--vscode-editor-background); /* 배경을 중립적으로 변경 */
                        color: var(--vscode-button-secondaryForeground);
                        border-color: var(--vscode-button-secondaryBackground); /* 테두리로 강조 */
                    }
                    .accept-always-btn:hover {
                        background-color: var(--vscode-button-secondaryHoverBackground);
                    }
                </style>
            </head>
            <body>
                <div id="root">
                    <div class="loader-container">
                        <div class="loader"></div>
                        <div class="loading-text">Initializing Viper...</div>
                    </div>
                </div>
                <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
}

export class AIPartnerViewProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = 'viper.mainView';

    private _view?: vscode.WebviewView;

    private readonly _onDidReceiveMessage = new vscode.EventEmitter<any>();
    public readonly onDidReceiveMessage = this._onDidReceiveMessage.event;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly configService: ConfigService,
        private readonly llmService: LLMService,
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
            console.log('[ViperView] Received message from UI:', message);
            switch (message.command) {
                case 'debugLog':
                    try {
                        const payload = message.payload ?? {};
                        const src = payload.source ? String(payload.source) : 'UI';
                        const evt = payload.event ? String(payload.event) : 'debugLog';
                        const meta = payload.meta !== undefined ? payload.meta : undefined;
                        if (meta !== undefined) {
                            console.log(`[ViperView][${src}] ${evt}`, meta);
                        } else {
                            console.log(`[ViperView][${src}] ${evt}`);
                        }
                    } catch (e) {
                        console.log('[ViperView][UI] debugLog failed:', e);
                    }
                    break;
                case 'openFile':
                    if (message.filePath) {
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (workspaceFolders && workspaceFolders.length > 0) {
                            const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, message.filePath);
                            try {
                                await vscode.window.showTextDocument(fileUri);
                            } catch (error) {
                                vscode.window.showErrorMessage(`Could not open file: ${message.filePath}. Error: ${error}`);
                            }
                        } else {
                            vscode.window.showErrorMessage('No workspace folder open to locate the file.');
                        }
                    }
                    break;
                case 'requestFeatureToggles': {
                    try {
                        const streamingEnabled = this.configService.isStreamingEnabled();
                        const advancedHistorySummaryEnabled = this.configService.getAdvancedHistorySummaryEnabled();
                        this.postMessage({ command: 'featureToggles', payload: { streamingEnabled, advancedHistorySummaryEnabled } });
                    } catch (e: any) {
                        this.postMessage({ command: 'featureToggles', payload: { streamingEnabled: false, advancedHistorySummaryEnabled: false } });
                    }
                    break;
                }
                case 'setStreamingEnabled': {
                    try {
                        const enabled = !!(message.payload?.enabled ?? message.enabled);
                        await this.configService.setStreamingEnabled(enabled);
                        this.postMessage({ command: 'featureToggles', payload: { streamingEnabled: enabled, advancedHistorySummaryEnabled: this.configService.getAdvancedHistorySummaryEnabled() } });
                    } catch {}
                    break;
                }
                case 'setAdvancedHistorySummaryEnabled': {
                    try {
                        const enabled = !!(message.payload?.enabled ?? message.enabled);
                        await this.configService.setAdvancedHistorySummaryEnabled(enabled);
                        this.postMessage({ command: 'featureToggles', payload: { streamingEnabled: this.configService.isStreamingEnabled(), advancedHistorySummaryEnabled: enabled } });
                    } catch {}
                    break;
                }
                case 'requestLlmSettings':
                    {
                        // 일부 설정은 비동기 SecretStorage를 사용하므로 await 필요
                        const openaiKeys = await this.configService.getOpenaiApiKeys();
                        const ollamaKey = await this.configService.getOllamaApiKey();
                        const llmSettings = {
                            llmProvider: this.configService.getLlmProvider(),
                            openaiApiKeys: openaiKeys.join(','),
                            openaiEndpoint: this.configService.getOpenaiEndpoint(),
                            ollamaEndpoint: this.configService.getOllamaEndpoint(),
                            ollamaApiKey: ollamaKey,
                            ollamaIsCloud: this.configService.getOllamaIsCloud(),
                            anthropicApiKey: this.configService.getAnthropicApiKey(),
                            anthropicEndpoint: this.configService.getAnthropicEndpoint(),
                            xaiApiKey: this.configService.getXaiApiKey(),
                            xaiEndpoint: this.configService.getXaiEndpoint(),
                            googleApiKey: this.configService.getGoogleApiKey(),
                            googleEndpoint: this.configService.getGoogleEndpoint(),
                            groqApiKey: this.configService.getGroqApiKey(),
                            groqEndpoint: this.configService.getGroqEndpoint(),
                            openrouterApiKey: this.configService.getOpenrouterApiKey(),
                            openrouterEndpoint: this.configService.getOpenrouterEndpoint(),
                            model: this.configService.getModel(),
                        };
                        this.postMessage({ command: 'llmSettingsResponse', payload: llmSettings });
                    }
                    break;
                case 'saveLlmSettings':
                    {
                        const {
                            llmProvider,
                            openaiApiKeys, openaiEndpoint,
                            ollamaEndpoint, ollamaApiKey, ollamaIsCloud,
                            anthropicApiKey, anthropicEndpoint,
                            xaiApiKey, xaiEndpoint,
                            googleApiKey, googleEndpoint,
                            groqApiKey, groqEndpoint,
                            openrouterApiKey, openrouterEndpoint,
                            model
                        } = message.payload;

                        // Removed verbose settings logging per UX/security request

                        await this.configService.setLlmProvider(llmProvider);

                        // Save provider-specific settings
                        await Promise.all([
                            // OpenAI
                            this.configService.setOpenaiApiKeys(openaiApiKeys.split(',').map((key: string) => key.trim()).filter((key: string) => key.length > 0)),
                            this.configService.setOpenaiEndpoint(openaiEndpoint),

                            // Ollama
                            this.configService.setOllamaEndpoint(ollamaEndpoint),
                            this.configService.setOllamaApiKey(ollamaApiKey),
                            this.configService.setOllamaIsCloud(ollamaIsCloud),

                            // Anthropic
                            this.configService.setAnthropicApiKey(anthropicApiKey),
                            this.configService.setAnthropicEndpoint(anthropicEndpoint),

                            // xAI
                            this.configService.setXaiApiKey(xaiApiKey),
                            this.configService.setXaiEndpoint(xaiEndpoint),

                            // Google
                            this.configService.setGoogleApiKey(googleApiKey),
                            this.configService.setGoogleEndpoint(googleEndpoint),

                            // Groq
                            this.configService.setGroqApiKey(groqApiKey),
                            this.configService.setGroqEndpoint(groqEndpoint),

                            // OpenRouter
                            this.configService.setOpenrouterApiKey(openrouterApiKey),
                            this.configService.setOpenrouterEndpoint(openrouterEndpoint),

                            // Model
                            this.configService.setModel(model)
                        ]);

                        // Removed intrusive notification per UX request

                        // Refresh models list after saving settings
                        try {
                            const apiKeys = await this.configService.getApiKeys();
                            const apiKey = apiKeys[0] || '';
                            const endpoint = this.configService.getEndpoint();
                            const models = await this.llmService.listModels(llmProvider, apiKey, endpoint);
                            this.postMessage({ command: 'updateModels', payload: models });
                        } catch (error: any) {
                            console.error('[ViperView] Error refreshing models:', error);
                        }
                    }
                    break;
                case 'requestModels':
                    try {
                        const provider = this.configService.getLlmProvider();
                        const apiKeys = await this.configService.getApiKeys();
                        const apiKey = apiKeys[0] || '';
                        const endpoint = this.configService.getEndpoint();
                        const models = await this.llmService.listModels(provider, apiKey, endpoint);
                        this.postMessage({ command: 'updateModels', payload: models });
                    } catch (error: any) {
                        console.error('[ViperView] Error fetching models:', error);
                        this.postMessage({ command: 'error', payload: `Failed to load models: ${error.message}` });
                    }
                    break;
                case 'requestProfiles':
                    try {
                        let profiles = this.configService.getLlmProfiles();
                        let activeId = this.configService.getActiveProfileId();
                        if (!profiles || profiles.length === 0) {
                            // Migrate existing single settings into a default profile
                            const provider = this.configService.getLlmProvider();
                            const endpoint = this.configService.getEndpoint();
                            const model = this.configService.getModel();
                            const apiKeys = await this.configService.getApiKeys();
                            const apiKey = apiKeys[0] || '';
                            const defaultProfile = {
                                id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
                                name: 'Default',
                                provider,
                                endpoint,
                                model,
                                isDefault: true,
                                enabled: true,
                            };
                            await this.configService.saveProfile(defaultProfile, apiKey);
                            await this.configService.setActiveProfileId(defaultProfile.id);
                            profiles = this.configService.getLlmProfiles();
                            activeId = defaultProfile.id;
                        }
                        this.postMessage({ command: 'profilesResponse', payload: { profiles, activeProfileId: activeId } });
                    } catch (e: any) {
                        console.error('[ViperView] Error sending profiles:', e);
                        this.postMessage({ command: 'error', payload: `Failed to get profiles: ${e.message}` });
                    }
                    break;
                case 'saveProfile':
                    try {
                        const { profile, apiKey, activateAfterSave } = message.payload || {};
                        if (!profile || !profile.id) {
                            profile.id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
                        }
                        await this.configService.saveProfile(profile, apiKey);
                        if (activateAfterSave) {
                            await this.configService.setActiveProfileId(profile.id);
                            this.postMessage({ command: 'activeProfileChanged', payload: profile.id });
                        }
                        try {
                            const apiKeys = await this.configService.getApiKeys();
                            const apiKeyVal = apiKeys[0] || '';
                            const endpoint = this.configService.getEndpoint();
                            const models = await this.llmService.listModels(this.configService.getLlmProvider(), apiKeyVal, endpoint);
                            this.postMessage({ command: 'updateModels', payload: models });
                        } catch {}
                        const profiles = this.configService.getLlmProfiles();
                        const activeId = this.configService.getActiveProfileId();
                        this.postMessage({ command: 'profilesResponse', payload: { profiles, activeProfileId: activeId } });
                        this.postMessage({ command: 'profileSaved', payload: profile });
                    } catch (e: any) {
                        console.error('[ViperView] Error saving profile:', e);
                        this.postMessage({ command: 'error', payload: `Failed to save profile: ${e.message}` });
                    }
                    break;
                case 'deleteProfile':
                    try {
                        const { id } = message.payload || {};
                        if (id) {
                            await this.configService.deleteProfile(id);
                            this.postMessage({ command: 'profileDeleted', payload: id });
                            const profiles = this.configService.getLlmProfiles();
                            const activeId = this.configService.getActiveProfileId();
                            this.postMessage({ command: 'profilesResponse', payload: { profiles, activeProfileId: activeId } });
                        }
                    } catch (e: any) {
                        console.error('[ViperView] Error deleting profile:', e);
                        this.postMessage({ command: 'error', payload: `Failed to delete profile: ${e.message}` });
                    }
                    break;
                case 'setActiveProfile':
                    try {
                        const { id } = message.payload || {};
                        await this.configService.setActiveProfileId(id || null);
                        this.postMessage({ command: 'activeProfileChanged', payload: id || null });
                        const provider = this.configService.getLlmProvider();
                        const apiKeys = await this.configService.getApiKeys();
                        const apiKey = apiKeys[0] || '';
                        const endpoint = this.configService.getEndpoint();
                        const models = await this.llmService.listModels(provider, apiKey, endpoint);
                        this.postMessage({ command: 'updateModels', payload: models });
                    } catch (e: any) {
                        console.error('[ViperView] Error setting active profile:', e);
                        this.postMessage({ command: 'error', payload: `Failed to set active profile: ${e.message}` });
                    }
                    break;
                case 'setModel':
                    try {
                        const { model } = message.payload || {};
                        if (typeof model === 'string' && model.length > 0) {
                            await this.configService.setModel(model);
                            this.postMessage({ command: 'modelChanged', payload: model });
                        }
                    } catch (e: any) {
                        console.error('[ViperView] Error setting model:', e);
                        this.postMessage({ command: 'error', payload: `Failed to set model: ${e.message}` });
                    }
                    break;
                case 'setLlmProvider':
                    try {
                        const { provider } = message.payload || {};
                        if (provider) {
                            await this.configService.setLlmProvider(provider);
                            // After provider change, refresh models for that provider
                            const apiKeys = await this.configService.getApiKeys();
                            const apiKey = apiKeys[0] || '';
                            const endpoint = this.configService.getEndpoint();
                            const models = await this.llmService.listModels(provider, apiKey, endpoint);
                            this.postMessage({ command: 'updateModels', payload: models });
                            this.postMessage({ command: 'llmSettingsResponse', payload: { llmProvider: provider, model: this.configService.getModel() } });
                        }
                    } catch (e: any) {
                        console.error('[ViperView] Error setting LLM provider:', e);
                        this.postMessage({ command: 'error', payload: `Failed to set LLM provider: ${e.message}` });
                    }
                    break;
                case 'requestPick': {
                    // Trigger file picker UI by calling listWorkspaceFiles
                    const kind = message.payload?.kind || 'file';
                    this.postMessage({ command: 'listWorkspaceFiles', payload: { path: '', type: kind === 'folder' ? 'directory' : undefined } });
                    break;
                }
                case 'getSlashCommands':
                    this.sendSlashCommands([
                        { command: '/clear', description: 'Clear chat history' },
                        { command: '/reset', description: 'Reset session' },
                        { command: '/help', description: 'Show help' }
                    ]);
                    break;
                case 'insertAttachment':
                    // Echo back to UI to update state
                    this.postMessage(message);
                    break;
                case 'listWorkspaceFiles': {
                    try {
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (!workspaceFolders || workspaceFolders.length === 0) {
                            this.postMessage({ command: 'workspaceFilesList', payload: { files: [] } });
                            break;
                        }
                        const rootPath = workspaceFolders[0].uri.fsPath;
                        const targetPath = message.payload?.path || '';
                        const targetType = message.payload?.type || 'file';
                        const fullPath = targetPath ? require('path').join(rootPath, targetPath) : rootPath;
                        
                        const fs = require('fs').promises;
                        const path = require('path');
                        
                        try {
                            const entries = await fs.readdir(fullPath, { withFileTypes: true });
                            // Sort: directories first, then files, both alphabetically
                            const sortedEntries = entries.sort((a: any, b: any) => {
                                if (a.isDirectory() && !b.isDirectory()) return -1;
                                if (!a.isDirectory() && b.isDirectory()) return 1;
                                return a.name.localeCompare(b.name);
                            });
                            
                            const files = await Promise.all(
                                sortedEntries
                                    .filter((entry: any) => {
                                        if (targetType === 'directory') {
                                            return entry.isDirectory();
                                        }
                                        // For file picker, show both files and directories (to allow navigation)
                                        return true;
                                    })
                                    .map(async (entry: any) => {
                                        const entryPath = path.join(fullPath, entry.name);
                                        const relativePath = path.relative(rootPath, entryPath);
                                        return {
                                            name: entry.name,
                                            path: relativePath.replace(/\\/g, '/'),
                                            type: entry.isDirectory() ? 'directory' as const : 'file' as const
                                        };
                                    })
                            );
                            this.postMessage({ command: 'workspaceFilesList', payload: { files } });
                        } catch (error: any) {
                            console.error('[ViperView] Error listing workspace files:', error);
                            this.postMessage({ command: 'workspaceFilesList', payload: { files: [] } });
                        }
                    } catch (e: any) {
                        console.error('[ViperView] Error in listWorkspaceFiles:', e);
                        this.postMessage({ command: 'workspaceFilesList', payload: { files: [] } });
                    }
                    break;
                }
                default:
                    this._onDidReceiveMessage.fire(message);
                    break;
            }
        });

        const visibilityDisposable = webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.postMessage({ command: 'forceEnable' });
            }
        });

        webviewView.onDidDispose(() => {
            messageDisposable.dispose();
            visibilityDisposable.dispose();
            this._view = undefined; // 웹뷰가 닫힐 때 _view를 undefined로 설정
        }, null);
    }

    public postMessage(message: any) {
        if (this._view) {
            this._view.webview.postMessage(message);
        } else {
            console.error('[ViperView] Webview not available to post message.');
        }
    }

    // ============================================================================
    // A2A Standard Message Helpers
    // ============================================================================

    /**
     * Send A2A standard message
     */
    public sendA2AMessage(message: A2AMessage) {
        this.postMessage(message);
    }

    /**
     * Send progress log message
     * Example: sendProgressLog("[CodeEditAgent] Creating file...")
     */
    public sendProgressLog(text: string, level: 'info' | 'warning' | 'error' = 'info') {
        const message = createProgressMessage(text);
        // Type assertion since we know the first part is DataPart
        (message.parts[0] as any).data.level = level;
        this.sendA2AMessage(message);
    }

    /**
     * Send execution plan
     */
    public sendPlan(steps: PlanData['steps']) {
        const message = createPlanMessage(steps);
        this.sendA2AMessage(message);
    }

    /**
     * Send file edit metadata
     */
    public sendFileEdit(data: FileEditData) {
        const message = createFileEditMessage(data);
        this.sendA2AMessage(message);
    }

    /**
     * Send diff data
     */
    public sendDiff(data: any) {
        const message = createA2ADataMessage(A2A_MIME_TYPES.DIFF, data);
        this.sendA2AMessage(message);
    }

    /**
     * Send lint summary
     */
    public sendLintSummary(filePath: string, summary: string) {
        const message = createA2ADataMessage(A2A_MIME_TYPES.LINT_SUMMARY, {
            filePath,
            summary
        });
        this.sendA2AMessage(message);
    }

    /**
     * Send chat history
     */
    public sendHistory(messages: any[]) {
        const message = createA2ADataMessage(A2A_MIME_TYPES.HISTORY, messages);
        this.sendA2AMessage(message);
    }

    /**
     * Send LLM settings
     */
    public sendLLMSettings(settings: any) {
        const message = createA2ADataMessage(A2A_MIME_TYPES.LLM_SETTINGS, settings);
        this.sendA2AMessage(message);
    }

    /**
     * Send profiles
     */
    public sendProfiles(profiles: any[], activeProfileId?: string) {
        const message = createA2ADataMessage(A2A_MIME_TYPES.PROFILES, {
            profiles,
            activeProfileId
        });
        this.sendA2AMessage(message);
    }

    /**
     * Send available models
     */
    public sendModels(models: string[]) {
        const message = createA2ADataMessage(A2A_MIME_TYPES.MODELS, { models });
        this.sendA2AMessage(message);
    }

    /**
     * Send slash commands
     */
    public sendSlashCommands(commands: Array<{ command: string; description: string }>) {
        const message = createA2ADataMessage(A2A_MIME_TYPES.SLASH_COMMANDS, { commands });
        this.sendA2AMessage(message);
    }
}