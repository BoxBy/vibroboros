import * as vscode from 'vscode';
import { ConfigService } from './config_service';
import { LLMService } from './services/LLMService';
import { ModelInfoProvider } from './services/llm/ModelInfoProvider';
import { MCPHealthCheckService } from './services/MCPHealthCheckService';
import { OrchestratorAgent } from './agents/OrchestratorAgent';
import { CompositionRoot, ServiceIdentifiers } from './di/CompositionRoot';
import { A2AMessage, A2A_MIME_TYPES, createProgressMessage, createPlanMessage, createFileEditMessage, createA2ADataMessage, PlanData, FileEditData } from './types/A2AMessages';

const modelsCache = new Map<string, { models: any[], timestamp: number }>();

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
		`font-src ${cspSource} data:`,
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
        private readonly _context: vscode.ExtensionContext
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
                            let fileUri: vscode.Uri;
                            const isAbsolute = message.filePath.match(/^([a-zA-Z]:)|(^\/)/); // Simple check for absolute path (Windows drive or Unix root)
                            
                            if (isAbsolute) {
                                fileUri = vscode.Uri.file(message.filePath);
                            } else {
                                fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, message.filePath);
                            }

                            try {
                                try {
                                    await vscode.workspace.fs.stat(fileUri);
                                } catch {
                                    // File does not exist, create it with default content
                                    let content = '';
                                    if (message.filePath.endsWith('.json')) {
                                        if (message.filePath.includes('mcp-servers')) {
                                            content = JSON.stringify({ mcpServers: {} }, null, 2);
                                        } else if (message.filePath.includes('a2a-servers')) {
                                            content = JSON.stringify({ agents: [] }, null, 2);
                                        } else {
                                            content = '{}';
                                        }
                                    } else if (message.filePath.endsWith('.md')) {
                                        const agentNames = [
                                            'OrchestratorAgent',
                                            'ContextManagementAgent',
                                            'CodeEditAgent',
                                            'DocumentationGenerationAgent',
                                            'RefactoringSuggestionAgent',
                                            'TestGenerationAgent',
                                            'ReadmeGenerationAgent',
                                            'SecurityAnalysisAgent',
                                            'TaskDecompositionAgent',
                                            'BrainstormAgent',
                                            'BugFixAgent'
                                        ];
                                        
                                        content = '# Custom Instructions (Global)\nAnything written here will be applied to ALL agents.\n\n';
                                        content += agentNames.map(name => `## ${name}\nGuidelines for ${name} go here.\n`).join('\n');
                                    }
                                    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
                                }
                                
                                const doc = await vscode.workspace.openTextDocument(fileUri);
                                await vscode.window.showTextDocument(doc);
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
                        const autoCompactionEnabled = this.configService.getAutoCompactionEnabled();
                        const summarizeTokenLimit = this.configService.getSummarizeTokenLimit();
                        const contextTokenThreshold = this.configService.getContextTokenThreshold();
                        const thinkingLanguage = this.configService.getThinkingLanguage();
                        const userLanguage = this.configService.getUserLanguage();
                        const maxContextOverride = this.configService.getMaxContextOverride();
                        const useVSCodeThinkingLang = this.configService.getUseVSCodeThinkingLang();
                        const useVSCodeUserLang = this.configService.getUseVSCodeUserLang();
                        
                        // New Global settings
                        const globalRequestTimeout = this.configService.getGlobalRequestTimeout();
                        const globalTemperature = this.configService.getGlobalTemperature();
                        const safetyBufferRatio = this.configService.getSafetyBufferRatio();
                        const reasoningBudgets = this.configService.getReasoningBudgets();
                        const globalReasoningEffort = this.configService.getGlobalReasoningEffort();

                        // Security & Automation settings
                        const strictMode = this.configService.getStrictMode();
                        const reviewPolicy = this.configService.getReviewPolicy();
                        const terminalAutoExecution = this.configService.getTerminalAutoExecution();
                        const fileAccessPolicy = this.configService.getFileAccessPolicy();

                        this.postMessage({ 
                            command: 'featureToggles', 
                            payload: { 
                                streamingEnabled, 
                                advancedHistorySummaryEnabled,
                                autoCompactionEnabled,
                                summarizeTokenLimit,
                                contextTokenThreshold,
                                thinkingLanguage,
                                userLanguage,
                                maxContextOverride,
                                useVSCodeThinkingLang,
                                useVSCodeUserLang,
                                globalRequestTimeout,
                                globalTemperature,
                                safetyBufferRatio,
                                reasoningBudgets,
                                globalReasoningEffort,
                                strictMode,
                                reviewPolicy,
                                terminalAutoExecution,
                                fileAccessPolicy
                            } 
                        });
                    } catch (e: any) {
                        this.postMessage({ 
                            command: 'featureToggles', 
                            payload: { 
                                streamingEnabled: false, 
                                advancedHistorySummaryEnabled: false,
                                autoCompactionEnabled: false,
                                summarizeTokenLimit: 0.75,
                                contextTokenThreshold: 100000,
                                thinkingLanguage: 'English',
                                userLanguage: 'English',
                                useVSCodeThinkingLang: false,
                                useVSCodeUserLang: false,
                                globalRequestTimeout: 60000,
                                globalTemperature: 0.1,
                                safetyBufferRatio: 0.9,
                                reasoningBudgets: { low: 0.2, medium: 0.5, high: 0.8 },
                                globalReasoningEffort: 'medium',
                                strictMode: false,
                                reviewPolicy: 'agent-decides',
                                terminalAutoExecution: false,
                                fileAccessPolicy: 'request-each'
                            } 
                        });
                    }
                    break;
                }
                case 'setGlobalRequestTimeout': {
                    try {
                        const { timeout } = message.payload;
                        if (typeof timeout === 'number') {
                            await this.configService.setGlobalRequestTimeout(timeout);
                            this.postMessage({ command: 'featureToggles', payload: { globalRequestTimeout: timeout } });
                        }
                    } catch (e) { console.error('setGlobalRequestTimeout failed', e); }
                    break;
                }
                case 'setGlobalTemperature': {
                    try {
                        const { temperature } = message.payload;
                        if (typeof temperature === 'number') {
                            await this.configService.setGlobalTemperature(temperature);
                            this.postMessage({ command: 'featureToggles', payload: { globalTemperature: temperature } });
                        }
                    } catch (e) { console.error('setGlobalTemperature failed', e); }
                    break;
                }
                case 'setSafetyBufferRatio': {
                    try {
                        const { ratio } = message.payload;
                        if (typeof ratio === 'number') {
                            await this.configService.setSafetyBufferRatio(ratio);
                            this.postMessage({ command: 'featureToggles', payload: { safetyBufferRatio: ratio } });
                        }
                    } catch (e) { console.error('setSafetyBufferRatio failed', e); }
                    break;
                }
                case 'setReasoningBudgets': {
                    try {
                        const budgets = message.payload;
                        if (budgets && typeof budgets === 'object') {
                            await this.configService.setReasoningBudgets(budgets);
                            this.postMessage({ command: 'featureToggles', payload: { reasoningBudgets: budgets } });
                        }
                    } catch (e) { console.error('setReasoningBudgets failed', e); }
                    break;
                }
                case 'setGlobalReasoningEffort': {
                    try {
                        const { effort } = message.payload;
                        if (effort === 'low' || effort === 'medium' || effort === 'high') {
                            await this.configService.setGlobalReasoningEffort(effort);
                            this.postMessage({ command: 'featureToggles', payload: { globalReasoningEffort: effort } });
                        }
                    } catch (e) { console.error('setGlobalReasoningEffort failed', e); }
                    break;
                }
                case 'setSummarizeTokenLimit': {
                    try {
                        const { limit } = message.payload;
                        if (typeof limit === 'number') {
                            await this.configService.setSummarizeTokenLimit(limit);
                            // Echo back
                            this.postMessage({ command: 'featureToggles', payload: { summarizeTokenLimit: limit } }); 
                        }
                    } catch (e) { console.error('setSummarizeTokenLimit failed', e); }
                    break;
                }
                case 'setContextTokenThreshold': {
                    try {
                        const { limit } = message.payload;
                        if (typeof limit === 'number') {
                            await this.configService.setContextTokenThreshold(limit);
                            // Echo back
                            this.postMessage({ command: 'featureToggles', payload: { contextTokenThreshold: limit } });
                        }
                    } catch (e) { console.error('setContextTokenThreshold failed', e); }
                    break;
                }
                case 'setMaxContextOverride': {
                    try {
                        const { limit } = message.payload;
                        // limit can be number or undefined (null)
                        await this.configService.setMaxContextOverride(limit);
                        this.postMessage({ command: 'featureToggles', payload: { maxContextOverride: limit } });
                    } catch (e) { console.error('setMaxContextOverride failed', e); }
                    break;
                }
                case 'setUseVSCodeThinkingLang': {
                    try {
                        const { use } = message.payload;
                        if (typeof use === 'boolean') {
                            await this.configService.setUseVSCodeThinkingLang(use);
                            this.postMessage({ command: 'featureToggles', payload: { useVSCodeThinkingLang: use } });
                        }
                    } catch (e) { console.error('setUseVSCodeThinkingLang failed', e); }
                    break;
                }
                case 'setThinkingLanguage': {
                    try {
                        const { lang } = message.payload;
                        if (typeof lang === 'string') {
                            await this.configService.setThinkingLanguage(lang);
                            this.postMessage({ command: 'featureToggles', payload: { thinkingLanguage: lang } });
                        }
                    } catch (e) {
                        console.error('setThinkingLanguage failed', e);
                    }
                    break;
                }
                case 'setUseVSCodeUserLang': {
                    try {
                        const { use } = message.payload;
                        if (typeof use === 'boolean') {
                            await this.configService.setUseVSCodeUserLang(use);
                            this.postMessage({ command: 'featureToggles', payload: { useVSCodeUserLang: use } });
                        }
                    } catch (e) { console.error('setUseVSCodeUserLang failed', e); }
                    break;
                }
                case 'setUserLanguage': {
                    try {
                        const { lang } = message.payload;
                        if (typeof lang === 'string') {
                            await this.configService.setUserLanguage(lang);
                            this.postMessage({ command: 'featureToggles', payload: { userLanguage: lang } });
                        }
                    } catch (e) {
                        console.error('setUserLanguage failed', e);
                    }
                    break;
                }
                case 'setStrictMode': {
                    try {
                        const { enabled } = message.payload;
                        if (typeof enabled === 'boolean') {
                            await this.configService.setStrictMode(enabled);
                            this.postMessage({ command: 'featureToggles', payload: { strictMode: enabled } });
                        }
                    } catch (e) {
                        console.error('setStrictMode failed', e);
                    }
                    break;
                }
                case 'setReviewPolicy': {
                    try {
                        const { policy } = message.payload;
                        if (typeof policy === 'string') {
                            await this.configService.setReviewPolicy(policy as any);
                            this.postMessage({ command: 'featureToggles', payload: { reviewPolicy: policy } });
                        }
                    } catch (e) {
                        console.error('setReviewPolicy failed', e);
                    }
                    break;
                }
                case 'setTerminalAutoExecution': {
                    try {
                        const { enabled } = message.payload;
                        if (typeof enabled === 'boolean') {
                            await this.configService.setTerminalAutoExecution(enabled);
                            this.postMessage({ command: 'featureToggles', payload: { terminalAutoExecution: enabled } });
                        }
                    } catch (e) {
                        console.error('setTerminalAutoExecution failed', e);
                    }
                    break;
                }
                case 'setFileAccessPolicy': {
                    try {
                        const { policy } = message.payload;
                        if (typeof policy === 'string') {
                            await this.configService.setFileAccessPolicy(policy as any);
                            this.postMessage({ command: 'featureToggles', payload: { fileAccessPolicy: policy } });
                        }
                    } catch (e) {
                        console.error('setFileAccessPolicy failed', e);
                    }
                    break;
                }
                case 'setAutoCompactionEnabled': {
                    try {
                        const { enabled } = message.payload;
                        if (typeof enabled === 'boolean') {
                            await this.configService.setAutoCompactionEnabled(enabled);
                            this.postMessage({ command: 'featureToggles', payload: { autoCompactionEnabled: enabled } });
                        }
                    } catch (e) {
                        console.error('setAutoCompactionEnabled failed', e);
                    }
                    break;
                }
                case 'newChat':
                    try {
                        const { initialQuery, messageId } = message;
                        const orchestrator = CompositionRoot.resolve<OrchestratorAgent>(ServiceIdentifiers.OrchestratorAgent);
                        await orchestrator.acceptMessage({
                            type: 'text',
                            from: 'user',
                            text: initialQuery || '',
                            contextId: 'new-chat-session', // Reset context
                            messageId // Pass explicit ID
                        });
                    } catch (e) {
                        console.error('[ViperView] newChat failed:', e);
                    }
                    break;

                case 'chatMessage':
                    try {
                        const orchestrator = CompositionRoot.resolve<OrchestratorAgent>(ServiceIdentifiers.OrchestratorAgent);
                        await orchestrator.acceptMessage({
                            type: 'text',
                            from: 'user',
                            text: message.text,
                            attachments: message.attachments,
                            messageId: message.messageId // Pass explicit ID
                        });
                    } catch (e) {
                         console.error('[ViperView] chatMessage failed:', e);
                    }
                    break;
                case 'rollbackTo':
                        try {
                            const { messageId, timestamp } = message.payload;
                            const orchestrator = CompositionRoot.resolve<OrchestratorAgent>(ServiceIdentifiers.OrchestratorAgent);
                            // Orchestrator needs to implement rollback mechanism
                            // For now, we'll assume we can signal it.
                            // But usually rollback is state management.
                            // If Orchestrator supports it, called it.
                            if (typeof (orchestrator as any).rollbackTo === 'function') {
                                await (orchestrator as any).rollbackTo(messageId, timestamp);
                            }
                        } catch (e) {
                             console.error('[ViperView] rollbackTo failed:', e);
                        }
                        break;
                
                case 'refreshConfiguredItems': {
                    try {
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        let mcp: string[] = [];
                        let a2a: string[] = [];
                        let prompts: { name: string; content: string }[] = [];

                        if (workspaceFolders && workspaceFolders.length > 0) {
                            const root = workspaceFolders[0].uri;

                            // Read .agent/mcp-servers.json
                            try {
                                const mcpUri = vscode.Uri.joinPath(root, '.agent', 'mcp-servers.json');
                                // Use try-catch for reading as file might not exist
                                try {
                                    const mcpContent = await vscode.workspace.fs.readFile(mcpUri);
                                    const mcpJson = JSON.parse(Buffer.from(mcpContent).toString('utf8'));
                                    if (mcpJson && typeof mcpJson === 'object') {
                                        // Support both wrapper 'mcpServers' key and direct object
                                        if (mcpJson.mcpServers && typeof mcpJson.mcpServers === 'object') {
                                            mcp = Object.keys(mcpJson.mcpServers);
                                        } else {
                                            mcp = Object.keys(mcpJson);
                                        }
                                    }
                                } catch {}
                            } catch (e) { console.log('MCP config read error', e); }

                            // Read .agent/a2a-servers.json
                            try {
                                const a2aUri = vscode.Uri.joinPath(root, '.agent', 'a2a-servers.json');
                                try {
                                    const a2aContent = await vscode.workspace.fs.readFile(a2aUri);
                                    const a2aJson = JSON.parse(Buffer.from(a2aContent).toString('utf8'));
                                    if (Array.isArray(a2aJson)) {
                                        a2a = a2aJson.map((c: any) => c.card?.name || c.name).filter((n: any) => typeof n === 'string');
                                    }
                                } catch {}
                            } catch (e) { console.log('A2A config read error', e); }

                            // Read .agent/AGENTS.md
                            try {
                                const agentsUri = vscode.Uri.joinPath(root, '.agent', 'AGENTS.md');
                                try {
                                    const agentsContent = Buffer.from(await vscode.workspace.fs.readFile(agentsUri)).toString('utf8');
                                    // Extract headings level 2 (## AgentName) and content
                                    // Also extract Global section (level 1 #)
                                    const lines = agentsContent.split('\n');
                                    let currentAgent = '';
                                    let currentContent: string[] = [];
                                    
                                    for (const line of lines) {
                                        const matchH1 = line.match(/^#\s+(.+)$/); // Global
                                        const matchH2 = line.match(/^##\s+(.+)$/); // Agent
                                        
                                        if (matchH1 || matchH2) {
                                            // Finish previous agent
                                            if (currentAgent) {
                                                prompts.push({ name: currentAgent, content: currentContent.join('\n').trim() });
                                                currentContent = [];
                                            }
                                            // Start new section
                                            currentAgent = matchH1 ? 'Global' : matchH2![1].trim();
                                            // If it's the specific title "Custom Instructions (Global)", normalize to "Global"
                                            if (currentAgent.includes('Custom Instructions (Global)')) {
                                                currentAgent = 'Global';
                                            }
                                        } else if (currentAgent) {
                                            currentContent.push(line);
                                        }
                                    }
                                    // Push last agent
                                    if (currentAgent) {
                                        prompts.push({ name: currentAgent, content: currentContent.join('\n').trim() });
                                    }
                                } catch {}
                            } catch (e) { console.log('Prompts config read error', e); }

                            // Perform health check
                            let healthStatus = { mcp: {}, a2a: {} };
                            try {
                                const healthService = CompositionRoot.resolve<MCPHealthCheckService>(ServiceIdentifiers.MCPHealthCheckService);
                                const force = message.payload?.force === true;
                                healthStatus = await healthService.checkAllServers(root.fsPath, force);
                            } catch (e) {
                                console.error('[ViperView] Health check failed:', e);
                            }

                            this.postMessage({
                                command: 'configuredItemsUpdate',
                                payload: { mcp, a2a, prompts, healthStatus }
                            });
                        }
                    } catch (error) {
                        console.error('[ViperView] Error refreshing configured items:', error);
                    }
                    break;
                }
                case 'requestAgents':
                    try {
                        // Get internal Viper agents (not A2A external agents)
                        const internalAgents = this.configService.getInternalAgents();
                        this.postMessage({ 
                            command: 'updateAgentList', 
                            agents: internalAgents 
                        });
                    } catch (error) {
                        console.error('[AIPartnerViewProvider] Failed to get internal agents:', error);
                        this.postMessage({ 
                            command: 'updateAgentList', 
                            agents: [] 
                        });
                    }
                    break;
                
                case 'requestSystemPromptTokenCount': {
                    try {
                        const { SystemPromptFactory } = require('./services/SystemPromptFactory');
                        const factory = CompositionRoot.resolve<any>(ServiceIdentifiers.SystemPromptFactory);
                        const prompt: string = await factory.generate('router', 'OrchestratorAgent', 3, '', { excludeHistory: true });
                        // Approximate token count: ~4 chars per token (GPT-4 standard heuristic)
                        const tokenCount = Math.ceil(prompt.length / 4);
                        this.postMessage({ command: 'systemPromptTokenCount', payload: tokenCount });
                    } catch (e) {
                        console.warn('[AIPartnerViewProvider] requestSystemPromptTokenCount failed:', e);
                        // Send fallback estimate if factory is unavailable
                        this.postMessage({ command: 'systemPromptTokenCount', payload: 2000 });
                    }
                    break;
                }
                case 'requestModels':
                    try {
                        const provider = message.payload?.provider || this.configService.getLlmProvider() || 'openai';
                        let apiKey = message.payload?.apiKey || '';
                        if (!apiKey) {
                            const apiKeys = await this.configService.getApiKeys();
                            apiKey = apiKeys?.[0] || '';
                        }
                        
                        let endpoint = message.payload?.endpoint || '';
                        if (!endpoint) {
                            switch (provider) {
                                case 'openai': endpoint = this.configService.getOpenaiEndpoint(); break;
                                case 'ollama': endpoint = this.configService.getOllamaEndpoint(); break;
                                case 'anthropic': endpoint = this.configService.getAnthropicEndpoint(); break;
                                case 'xai': endpoint = this.configService.getXaiEndpoint(); break;
                                case 'google': endpoint = this.configService.getGoogleEndpoint(); break;
                                case 'groq': endpoint = this.configService.getGroqEndpoint(); break;
                                case 'openrouter': endpoint = this.configService.getOpenrouterEndpoint(); break;
                                case 'zai': endpoint = this.configService.getZaiEndpoint(); break;
                                default: endpoint = this.configService.getEndpoint() || '';
                            }
                        }

                        if (apiKey) {
                            const cacheKey = `${provider}|${endpoint}|${apiKey}`;
                            const now = Date.now();
                            const isForceRefresh = message.payload?.forceRefresh === true;

                            if (!isForceRefresh) {
                                const cached = modelsCache.get(cacheKey);
                                if (cached && (now - cached.timestamp < 5 * 60 * 1000)) {
                                    this.postMessage({ command: 'updateModels', payload: cached.models });
                                    break;
                                }
                            }

                            const models = await this.llmService.listModels(provider as any, apiKey, endpoint);
                            const { STATIC_MODEL_REGISTRY } = require('./constants/ModelRegistry');
                            
                            const modelsWithContext = await Promise.all(
                                models.map(async (modelId: string) => {
                                    const staticInfo = STATIC_MODEL_REGISTRY[modelId];
                                    if (staticInfo?.maxContextTokens) {
                                        return { id: modelId, maxContext: staticInfo.maxContextTokens };
                                    }
                                    try {
                                        const info = await Promise.race([
                                            CompositionRoot.resolve<ModelInfoProvider>(ServiceIdentifiers.ModelInfoProvider).getModelInfo(provider, modelId, apiKey, endpoint),
                                            new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
                                        ]);
                                        return { id: modelId, maxContext: info?.maxContextTokens || undefined };
                                    } catch {
                                        return { id: modelId, maxContext: undefined };
                                    }
                                })
                            );
                            
                            modelsCache.set(cacheKey, { models: modelsWithContext, timestamp: now });
                            this.postMessage({ command: 'updateModels', payload: modelsWithContext });
                        } else {
                            this.postMessage({ command: 'updateModels', payload: [] });
                        }
                    } catch (error) {
                        console.error('[AIPartnerViewProvider] Error fetching models:', error);
                        this.postMessage({ command: 'updateModels', payload: [] });
                    }
                    break;
                
                // LLM Configuration & Profiles
                case 'requestLlmSettings':
                    try {
                        const settings = {
                            llmProvider: this.configService.getLlmProvider(),
                            openaiApiKeys: (await this.configService.getOpenaiApiKeys()).join(','),
                            openaiEndpoint: this.configService.getOpenaiEndpoint(),
                            ollamaEndpoint: this.configService.getOllamaEndpoint(),
                            ollamaApiKey: await this.configService.getOllamaApiKey(),
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
                            zaiApiKey: this.configService.getZaiApiKey(),
                            zaiEndpoint: this.configService.getZaiEndpoint(),
                            ollamaIsCloud: this.configService.getOllamaIsCloud(),
                            isCodingPlan: this.configService.getZaiIsCodingPlan(),
                            model: this.configService.getModel(),
                            modelMaxContext: 8192 // Default
                        };

                        // Fetch actual context size
                        try {
                            const info = await CompositionRoot.resolve<ModelInfoProvider>(ServiceIdentifiers.ModelInfoProvider).getModelInfo(
                                settings.llmProvider, 
                                settings.model,
                                // Pass API key just in case dynamic fetch is needed
                                settings.llmProvider === 'google' ? settings.googleApiKey :
                                settings.llmProvider === 'openrouter' ? settings.openrouterApiKey :
                                settings.llmProvider === 'ollama' ? settings.ollamaApiKey : undefined,
                                settings.llmProvider === 'ollama' ? settings.ollamaEndpoint : undefined
                            );
                            settings.modelMaxContext = info.maxContextTokens;
                        } catch (err) {
                            console.warn('[ViperView] Failed to fetch model info for context size', err);
                        }

                        this.postMessage({ command: 'llmSettingsResponse', payload: settings });
                    } catch (e) {
                         console.error('requestLlmSettings failed', e);
                    }
                    break;
                case 'saveLlmSettings':
                    try {
                        const s = message.payload;
                        if (s) {
                            if (s.llmProvider) { await this.configService.setLlmProvider(s.llmProvider); }
                            if (s.openaiApiKeys !== undefined) { await this.configService.setOpenaiApiKeys(s.openaiApiKeys.split(',')); }
                            if (s.openaiEndpoint !== undefined) { await this.configService.setOpenaiEndpoint(s.openaiEndpoint); }
                            if (s.ollamaEndpoint !== undefined) { await this.configService.setOllamaEndpoint(s.ollamaEndpoint); }
                            if (s.ollamaApiKey !== undefined) { await this.configService.setOllamaApiKey(s.ollamaApiKey); }
                            if (s.ollamaIsCloud !== undefined) { await this.configService.setOllamaIsCloud(s.ollamaIsCloud); }
                            if (s.anthropicApiKey !== undefined) { await this.configService.setAnthropicApiKey(s.anthropicApiKey); }
                            if (s.anthropicEndpoint !== undefined) { await this.configService.setAnthropicEndpoint(s.anthropicEndpoint); }
                            if (s.xaiApiKey !== undefined) { await this.configService.setXaiApiKey(s.xaiApiKey); }
                            if (s.xaiEndpoint !== undefined) { await this.configService.setXaiEndpoint(s.xaiEndpoint); }
                            if (s.googleApiKey !== undefined) { await this.configService.setGoogleApiKey(s.googleApiKey); }
                            if (s.googleEndpoint !== undefined) { await this.configService.setGoogleEndpoint(s.googleEndpoint); }
                            if (s.groqApiKey !== undefined) { await this.configService.setGroqApiKey(s.groqApiKey); }
                            if (s.groqEndpoint !== undefined) { await this.configService.setGroqEndpoint(s.groqEndpoint); }
                            if (s.openrouterApiKey !== undefined) { await this.configService.setOpenrouterApiKey(s.openrouterApiKey); }
                            if (s.openrouterEndpoint !== undefined) { await this.configService.setOpenrouterEndpoint(s.openrouterEndpoint); }
                            if (s.model !== undefined) { await this.configService.setModel(s.model); }

                            // Refresh settings
                            vscode.window.showInformationMessage('LLM Settings Saved');
                            
                            // Re-fetch model info to provide accurate maxContextTokens
                            let modelMaxContext = 0;
                            try {
                                const info = await CompositionRoot.resolve<ModelInfoProvider>(ServiceIdentifiers.ModelInfoProvider).getModelInfo(
                                    s.llmProvider || 'openai', 
                                    s.model || '',
                                    // Pass API key just in case dynamic fetch is needed
                                    s.llmProvider === 'google' ? s.googleApiKey :
                                    s.llmProvider === 'openrouter' ? s.openrouterApiKey :
                                    s.llmProvider === 'ollama' ? s.ollamaApiKey : undefined,
                                    s.llmProvider === 'ollama' ? s.ollamaEndpoint : undefined
                                );
                                modelMaxContext = info.maxContextTokens;
                            } catch (err) {
                                console.warn('[ViperView] Failed to fetch model info during save:', err);
                            }

                            // Echo back with updated context
                            this.postMessage({ 
                                command: 'llmSettingsResponse', 
                                payload: { ...s, modelMaxContext } 
                            });
                        }
                    } catch (e) {
                         vscode.window.showErrorMessage('Failed to save LLM settings: ' + e);
                    }
                    break;
                case 'requestProfiles':
                    try {
                        let rawProfiles = this.configService.getLlmProfiles();
                        let needsSave = false;
                        rawProfiles = rawProfiles.map(p => {
                            if (!p.id) {
                                p.id = 'profile_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
                                needsSave = true;
                            }
                            return p;
                        });
                        
                        if (needsSave) {
                            await this.configService.setLlmProfiles(rawProfiles);
                        }

                        // Fetch API keys for each profile for UI editing
                        const profiles = await Promise.all(rawProfiles.map(async p => {
                            const apiKey = await this.configService.getProfileApiKey(p.id!);
                            return { ...p, apiKey };
                        }));
                        const activeProfileId = this.configService.getActiveProfileId();
                        this.postMessage({ command: 'profilesResponse', payload: { profiles, activeProfileId } });
                    } catch (e) {
                        console.error('requestProfiles failed', e);
                        this.postMessage({ command: 'profilesResponse', payload: { profiles: [], activeProfileId: null } });
                    }
                    break;
                case 'saveProfile':
                    try {
                        const { profile, apiKey, activateAfterSave } = message.payload;
                        const saved = await this.configService.saveProfile(profile, apiKey);
                        if (activateAfterSave) {
                            await this.configService.setActiveProfileId(saved.id || null);
                        }
                        this.postMessage({ command: 'profileSaved', payload: saved });
                        vscode.window.showInformationMessage(`Profile '${saved.name}' saved.`);
                    } catch (e) {
                        vscode.window.showErrorMessage('Failed to save profile: ' + e);
                    }
                    break;
                case 'deleteProfile':
                    try {
                        const { id } = message.payload;
                        await this.configService.deleteProfile(id);
                        this.postMessage({ command: 'profileDeleted', payload: { id } });
                        vscode.window.showInformationMessage('Profile deleted.');
                    } catch (e) {
                        vscode.window.showErrorMessage('Failed to delete profile: ' + e);
                    }
                    break;
                case 'setActiveProfile':
                    try {
                        const { id } = message.payload;
                        await this.configService.setActiveProfileId(id);
                        this.postMessage({ command: 'activeProfileChanged', payload: id });
                        vscode.window.showInformationMessage('Active profile changed.');
                    } catch (e) {
                        vscode.window.showErrorMessage('Failed to set active profile: ' + e);
                    }
                    break;

                case 'insertAttachment':
                    // Echo back to UI so it can update its local state
                    this.postMessage({ command: 'insertAttachment', payload: message.payload });
                    break;

                case 'updatePlanFromUI':
                    try {
                        const { steps } = message.payload;
                        if (Array.isArray(steps)) {
                            const orchestrator = CompositionRoot.resolve<OrchestratorAgent>(ServiceIdentifiers.OrchestratorAgent);
                            if (orchestrator) {
                                (orchestrator as any).updatePlan(steps);
                            }
                        }
                    } catch (e) {
                        console.error('[ViperView] updatePlanFromUI failed:', e);
                    }
                    break;

                case 'getSlashCommands':
                    try {
                        const commands = [
                            { command: '/clear', description: 'Clear the conversation' },
                            { command: '/help', description: 'Show available commands' },
                            { command: '/model', description: 'Change the model' },
                            { command: '/export', description: 'Export conversation' },
                            { command: '/settings', description: 'Open settings' }
                        ];
                        this.postMessage({ command: 'slashCommandsResponse', payload: commands });
                    } catch (e) {
                        console.error('getSlashCommands failed', e);
                        this.postMessage({ command: 'slashCommandsResponse', payload: [] });
                    }
                    break;

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