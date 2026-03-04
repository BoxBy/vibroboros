import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { startA2AServer } from './a2a_server';
import { AIPartnerViewProvider } from './AIPartnerViewProvider';
import { createMCPServer } from './server/MCPServer';
// Prefer SDK's built-in in-memory transport for robust in-process MCP wiring
// Use static import for InMemoryTransport to ensure proper bundling
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createInProcessDuplex } from './mcp_in_process_duplex';
import * as mcpClientModule from '@modelcontextprotocol/sdk/client';
// Use dynamic require for stdio transport to avoid TS type resolution issues across SDK versions
// Use static import for stdio transport to ensure proper bundling
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { A2AClient } from '@a2a-js/sdk/client';
import { setMcpClient } from './mcp_client_provider';
import { getMcpClient } from './mcp_client_provider';
import { ConfigService } from './config_service';
import { LLMService } from './services/LLMService';
import { AuthService } from './auth_service';
import { DeveloperLogService } from './services/DeveloperLogService';
import { A2AMessage } from './interfaces/A2AMessage';
import { OrchestratorAgent } from './agents/OrchestratorAgent';
import { SemanticModelService } from './services/SemanticModelService';
import { CompositionRoot, ServiceIdentifiers } from './di/CompositionRoot';
import { ISystemPromptFactory } from './di/interfaces/ISystemPromptFactory';
import * as jsdiff from 'diff'; // jsdiff
import { TerminalStreamService } from './services/TerminalStreamService';
import type { Dirent } from 'fs';
import { MCPHealthCheckService } from './services/MCPHealthCheckService';
// Testing imports - commented out during DI refactoring
// These will be re-enabled when needed
// import { HLEEvaluator } from './testing/HLE/HLE_Evaluator';
// import { MultiSWEEvaluator } from './testing/MultiSWE/MultiSWEEvaluator';

async function createCheckpoint(label: string) {
    try {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) { return; }
        const root = folders[0].uri.fsPath;
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const target = path.join(root, '.viper', 'checkpoints', `${stamp}-${label}`);
        await fs.mkdir(target, { recursive: true });
        const exclude = new Set(['.git', '.viper', 'node_modules']);
        const copyRecursive = async (src: string, dst: string) => {
            const entries = await fs.readdir(src, { withFileTypes: true });
            for (const ent of entries) {
                if (exclude.has(ent.name)) { continue; }
                const s = path.join(src, ent.name);
                const d = path.join(dst, ent.name);
                if (ent.isDirectory()) {
                    await fs.mkdir(d, { recursive: true });
                    await copyRecursive(s, d);
                } else if (ent.isFile()) {
                    const data = await fs.readFile(s);
                    await fs.writeFile(d, data);
                }
            }
        };
        await copyRecursive(root, target);
    } catch {}
}

function defaultContentForFile(filePath: string): string {
    const fileName = path.basename(filePath);
    if (fileName === 'mcp-servers.json') {
        return '{\n  "mcpServers": {}\n}\n';
    }
    if (fileName === 'a2a-servers.json') {
        return '[]\n';
    }
    if (fileName === 'AGENTS.md') {
        return `# Viper Agents Configuration

## Available Specialist Agents

This file defines the specialist agents available in the Viper system and their roles.

### Specialist Agents

- **CodeEditAgent**
  - File editing and code modifications
  - Supports: create, edit, delete, move, copy files
  - Uses: FileWriteTool, FileReadTool, FileDeleteTool, etc.

- **BrainstormAgent**
  - Creative brainstorming and ideation
  - Generates ideas and explores alternatives
  - Uses: Web search, semantic search

- **BugFixAgent**
  - Bug analysis and fixing
  - Analyzes code for potential issues
  - Uses: File reading, code analysis tools

- **TestGenerationAgent**
  - Test case generation
  - Creates unit tests and integration tests
  - Uses: File writing tools

- **DocumentationGenerationAgent**
  - Documentation creation
  - Generates documentation for code
  - Uses: File writing tools

- **ContextManagementAgent**
  - Context and memory management
  - Manages conversation context and memory
  - Uses: MemoryTool, Context tools

- **ReadmeGenerationAgent**
  - README and documentation generation
  - Creates project documentation
  - Uses: File writing tools

- **TaskDecompositionAgent**
  - Task breakdown and planning
  - Breaks down complex tasks
  - Uses: Planning tools

## Usage

Agents are automatically selected by the Orchestrator based on the task requirements. You can also configure per-agent LLM settings in the Settings page.

## Agent Configuration

Each agent can have its own LLM configuration:
- Model selection
- Endpoint configuration
- API key management

See Settings > Per-Agent LLM Overrides for more details.
`;
    }
    const ext = (path.extname(filePath) || '').toLowerCase();
    switch (ext) {
        case '.py':
            return "print('Hello, World!')\n";
        case '.ts':
            return 'export {}\n';
        case '.js':
            return "console.log('Hello, World!')\n";
        case '.md':
            return `# ${path.basename(filePath)}\n`;
        case '.json':
            return '{}\n';
        case '.sh':
            return '#!/usr/bin/env bash\n';
        case '.txt':
            return '\n';
        default:
            return '\n';
    }
}



function getWebviewContent(
    originalFilePath: string,
    originalCode: string,
    modifiedCode: string
): string {
    const diffPatch = jsdiff.createPatch(originalFilePath, originalCode, modifiedCode);

    return `
        <!DOCTYPE html>
        <html lang="ko">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/diff2html/3.4.47/diff2html.min.css" />
            <script src="https://cdnjs.cloudflare.com/ajax/libs/diff2html/3.4.47/diff2html.min.js"></script>
            <style>
                body { padding-bottom: 80px; /* Space for sticky buttons */ }
                .d2h-file-header { display: none; }
                .action-buttons {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    width: 100%;
                    padding: 15px 20px;
                    background-color: var(--vscode-editor-background);
                    border-top: 1px solid var(--vscode-editorWidget-border);
                    display: flex;
                    gap: 10px;
                    z-index: 99;
                }
                .action-btn {
                    padding: 8px 15px; border: none; border-radius: 5px; cursor: pointer; font-size: 14px;
                }
                .accept-btn {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                .decline-btn {
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-errorForeground);
                    border: 1px solid var(--vscode-errorForeground);
                }
                .accept-always-btn {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
            </style>
        </head>
        <body>
            <div id="diff-container"></div>

            <div class="action-buttons">
                <button id="acceptBtn" class="action-btn accept-btn">??Accept</button>
                <button id="declineBtn" class="action-btn decline-btn">??Decline</button>
                <button id="acceptAlwaysBtn" class="action-btn accept-always-btn">?? Accept (Always)</button>
                <button id="showInMainViewBtn" class="action-btn">?챷 Show in Main View</button>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                const originalFilePath = \${JSON.stringify(originalFilePath)};
                const originalCode = \${JSON.stringify(originalCode)};
                const modifiedCode = \${JSON.stringify(modifiedCode)};
                const diffPatch = \${JSON.stringify(diffPatch)}; // jsdiff濡??앹꽦???⑥튂

                // diff2html ?뚮뜑留?
                const diffHtml = Diff2Html.html(diffPatch, {
                    drawFileList: false,
                    matching: 'lines',
                    outputFormat: 'side-by-side',
                });
                document.getElementById('diff-container').innerHTML = diffHtml;


                document.getElementById('acceptBtn').addEventListener('click', () => {
                    vscode.postMessage({ command: 'acceptChange', filepath: originalFilePath, modifiedCode: modifiedCode });
                });

                document.getElementById('declineBtn').addEventListener('click', () => {
                    vscode.postMessage({ command: 'declineChange' });
                });

                document.getElementById('acceptAlwaysBtn').addEventListener('click', () => {
                    vscode.postMessage({ command: 'acceptAlways', filepath: originalFilePath, modifiedCode: modifiedCode });
                });

                document.getElementById('showInMainViewBtn').addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'showInMainView',
                        originalFilePath,
                        originalCode,
                        modifiedCode
                    });
                });
            </script>
        </body>
        </html>
    `;
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('AI Partner extension is now active.');
    try {

        // 1. Initialize DI Container
        CompositionRoot.initialize(context);

        // 2. Get services from DI container
        const configService = CompositionRoot.resolve<ConfigService>(ServiceIdentifiers.ConfigService);
        const llmService = CompositionRoot.resolve<LLMService>(ServiceIdentifiers.LLMService);
        const devLogService = CompositionRoot.resolve<DeveloperLogService>(ServiceIdentifiers.Logger);
        const semanticModelService = CompositionRoot.resolve<SemanticModelService>(ServiceIdentifiers.SemanticModelService);
        const systemPromptFactory = CompositionRoot.resolve<ISystemPromptFactory>(ServiceIdentifiers.SystemPromptFactory);
        const authService = AuthService.getInstance(configService); 
        // Register AuthService in DI for components using it via DI
        CompositionRoot.registerDynamic(ServiceIdentifiers.AuthService, authService);
        
        const diagnostics = vscode.languages.createDiagnosticCollection('viper');

        // Warm up MCP Health Check (background)
        MCPHealthCheckService.getInstance().warmUp(context.extensionPath).catch((err: any) => console.error('[viper] MCP warm-up failed:', err));

        // 2. Start the MCP server (for tools)
        const mcpServer = createMCPServer();
        // Create linked transports (client <-> server) with fallback
        let clientTransport: any;
        let serverTransport: any;
        if (InMemoryTransport?.createLinkedPair) {
            const pair = InMemoryTransport.createLinkedPair();
            clientTransport = pair[0];
            serverTransport = pair[1];
        } else {
            console.warn('[viper] InMemoryTransport unavailable, falling back to local duplex transport');
            const duplex = createInProcessDuplex();
            clientTransport = duplex.clientTransport as any;
            serverTransport = duplex.serverTransport as any;
        }
        const mcpClient = new mcpClientModule.Client({
            name: 'viper',
            version: '1.0.0',
            transport: clientTransport as any
        });

        // MCP client is ready to use (InProcessMcpTransport connects automatically)
        // Start MCP transport if needed
        try {
            // Connect server to duplex transport and start both ends
            if (typeof (mcpServer as any).connect === 'function') {
                await (mcpServer as any).connect(serverTransport as any);
            } else if (typeof (mcpServer as any).serve === 'function') {
                await (mcpServer as any).serve(serverTransport as any);
            }
            // Start both ends to flush any queued messages
            await (serverTransport as any).start?.();
            await (clientTransport as any).start?.();
            console.log('[viper] MCP transport started successfully.');
            if (typeof (mcpClient as any).connect === 'function') {
                await (mcpClient as any).connect(clientTransport as any);
                console.log('[viper] MCP client connected.');
            }
            try {
                const toolsRes = await (mcpClient as any).listTools();
                const cnt = Array.isArray(toolsRes?.tools) ? toolsRes.tools.length : 0;
                console.log(`[viper] MCP sanity check: listTools -> ${cnt} tools`);
            } catch (e: any) {
                console.warn('[viper] MCP sanity check listTools failed:', e?.message || e);
            }
        } catch (error: any) {
            console.warn('[viper] MCP startup/connect warning:', error?.message || error);
        }

        // 2-1. Attach external MCP servers from .agent/mcp-servers.json via stdio and route tools
        const externalClients = new Map<string, mcpClientModule.Client>();
        let mcpConfig: any = {};
        try {
            const mcpConfigPath = path.join(context.extensionPath, '.agent', 'mcp-servers.json');
            const mcpConfigRaw = await fs.readFile(mcpConfigPath, 'utf-8');
            mcpConfig = JSON.parse(mcpConfigRaw);
        } catch (e) {
            console.log('[viper] No or invalid mcp-servers.json; skipping external MCP setup.');
        }

        // Helper to start an MCP server
        const connectMcpServer = async (id: string, command: string, args: string[], env: any = {}) => {
            try {
                if (!StdioClientTransport) { throw new Error('Stdio transport not available'); }
                const transport = new StdioClientTransport({
                    command,
                    args,
                    env: { ...process.env, ...env },
                    stderr: 'pipe'
                } as any);
                const client = new mcpClientModule.Client({ name: `vb-${id}`, version: '1.0.0', transport });
                if (typeof (client as any).connect === 'function') { await (client as any).connect(transport as any); }
                externalClients.set(id, client);
                console.log(`[viper] Connected MCP '${id}'.`);
            } catch (e: any) {
                console.warn(`[viper] Failed to connect MCP '${id}':`, e?.message || e);
            }
        };

        // Start Embedded Defaults (if not overridden in config)
        const embeddedMap: Record<string, { pkg: string; bin: string }> = {
            'fetch': { pkg: 'fetch-mcp', bin: 'dist/index.js' }
        };

        for (const [id, info] of Object.entries(embeddedMap)) {
            // If user config has defined this server, skip embedded (user override)
            if (mcpConfig?.mcpServers?.[id]) {
                console.log(`[viper] Embedded MCP '${id}' overridden by config.`);
                continue;
            }
            try {
                const scriptPath = path.join(context.extensionPath, 'node_modules', info.pkg, info.bin);
                await fs.access(scriptPath); // Check existence
                await connectMcpServer(id, process.execPath, [scriptPath]);
            } catch (e) {
                console.warn(`[viper] Embedded MCP '${id}' not found or failed to start:`, e);
            }
        }

        // Start External Configured Servers
        if (mcpConfig && mcpConfig.mcpServers && typeof mcpConfig.mcpServers === 'object') {
            for (const [serverId, cfg] of Object.entries<any>(mcpConfig.mcpServers)) {
                if (cfg.enabled === false || cfg.active === false) { continue; }
                await connectMcpServer(serverId, cfg.command, Array.isArray(cfg.args) ? cfg.args : [], cfg.env);
            }
        }

        // Wrap default client with a router that can dispatch to externals
        const routedClient: any = {
            transport: (mcpClient as any).transport,
            async connect() {
                try {
                    if (typeof (mcpClient as any).connect === 'function') {
                        await (mcpClient as any).connect(clientTransport as any);
                    }
                } catch {}
                for (const [, client] of externalClients) {
                    try {
                        if (typeof (client as any).connect === 'function') {
                            await (client as any).connect();
                        }
                    } catch {}
                }
            },
            async callTool(req: any) {
                // Normalize request to SDK standard { name, arguments }
                const normName = (req?.name || req?.toolName || '').toString();
                const normArgs = (req?.arguments ?? req?.input ?? req?.parameters) ?? {};
                const normalized = { name: normName, arguments: normArgs };
                // Support 'serverId:ToolName' syntax
                const rawName = normName;
                const hasPrefix = typeof rawName === 'string' && rawName.includes(':');
                if (hasPrefix) {
                    const [serverId, toolName] = rawName.split(':', 2);
                    const client = externalClients.get(serverId);
                    if (!client) { throw new Error(`MCP server '${serverId}' not connected`); }
                    try {
                        return await (client as any).callTool({ name: toolName, arguments: normArgs });
                    } catch (err: any) {
                        const msg = (err?.message || '').toLowerCase();
                        if (msg.includes('not connected') && typeof (client as any).connect === 'function') {
                            await (client as any).connect();
                            return await (client as any).callTool({ name: toolName, arguments: normArgs });
                        }
                        throw err;
                    }
                }
                // Internal first with reconnect-once
                try {
                    return await (mcpClient as any).callTool(normalized);
                } catch (err: any) {
                    const msg = (err?.message || '').toLowerCase();
                    if (msg.includes('not connected') && typeof (mcpClient as any).connect === 'function') {
                        await (mcpClient as any).connect(clientTransport as any);
                        return await (mcpClient as any).callTool(normalized);
                    }
                    if (!msg.includes('not found')) { throw err; }
                    // Fallback: try each external until one succeeds
                    for (const [serverId, client] of externalClients) {
                        try {
                            return await (client as any).callTool({ name: normName, arguments: normArgs });
                        } catch (e2: any) {
                            const m2 = (e2?.message || '').toLowerCase();
                            if (m2.includes('not connected') && typeof (client as any).connect === 'function') {
                                await (client as any).connect();
                                try { return await (client as any).callTool({ name: normName, arguments: normArgs }); } catch {}
                            }
                        }
                    }
                    throw err;
                }
            },
            async listTools() {
                const out: any[] = [];
                try {
                    const res = await (mcpClient as any).listTools?.();
                    if (res?.tools) { out.push(...res.tools); }
                } catch (err: any) {
                    const msg = (err?.message || '').toLowerCase();
                    if (msg.includes('not connected') && typeof (mcpClient as any).connect === 'function') {
                        await (mcpClient as any).connect(clientTransport as any);
                        try { const res2 = await (mcpClient as any).listTools?.(); if (res2?.tools) { out.push(...res2.tools); } } catch {}
                    }
                }
                for (const [serverId, client] of externalClients) {
                    try {
                        const res = await (client as any).listTools?.();
                        const tools = (res?.tools || []).map((t: any) => ({ ...t, name: `${serverId}:${t.name}` }));
                        out.push(...tools);
                    } catch (e2: any) {
                        const m2 = (e2?.message || '').toLowerCase();
                        if (m2.includes('not connected') && typeof (client as any).connect === 'function') {
                            await (client as any).connect();
                            try {
                                const res2 = await (client as any).listTools?.();
                                const tools2 = (res2?.tools || []).map((t: any) => ({ ...t, name: `${serverId}:${t.name}` }));
                                out.push(...tools2);
                            } catch {}
                        }
                    }
                }
                return { tools: out };
            }
        };

        setMcpClient(routedClient as any);

        // 2-2. Load external A2A agent overrides (card URLs) from .agent/a2a-servers.json
        const a2aOverrides = new Map<string, string>(); // key: recipientName (lowercased, without 'Agent'), value: cardUrl
        const externalAgents = new Map<string, { name: string; description: string; url: string }>();
        try {
            const a2aCfgPath = path.join(context.extensionPath, '.agent', 'a2a-servers.json');
            const a2aRaw = await fs.readFile(a2aCfgPath, 'utf-8');
            const a2aCfg = JSON.parse(a2aRaw);
            if (Array.isArray(a2aCfg)) {
                for (const it of a2aCfg) {
                    const name: string | undefined = it?.card?.name;
                    const url: string | undefined = it?.card?.url;
                    const description: string | undefined = it?.card?.description;
                    if (typeof name === 'string' && typeof url === 'string' && url.startsWith('http')) {
                        const rec = name.replace(/Agent$/, '').toLowerCase();
                        a2aOverrides.set(rec, url.endsWith('/card') ? url : `${url.replace(/\/$/, '')}/card`);
                        externalAgents.set(name, { name, description: description || `External specialized agent: ${name}`, url });
                    }
                }
            }
        } catch {}

        // 3. Start the A2A server (for specialist agents)
        const port = configService.getA2AServerPort();
        const agentBaseUrl = `http://localhost:${port}`;
        const a2aClientCache = new Map<string, any>();
        // Track agents mounted on the local A2A server to prefer local routing over overrides
        const localAgentNames = new Set<string>(); // recipientName format: lowercased, without 'Agent'
        // Readiness barrier: dispatch will await until A2A server is started
        let a2aReadyResolve: (() => void) | undefined;
        const a2aReady = new Promise<void>(resolve => { a2aReadyResolve = resolve; });
        console.log('[viper] [extension.ts] Starting A2A server...');
        let orchestratorInstance: OrchestratorAgent | undefined;
        const dispatch = async (message: A2AMessage<any>) => {
            // Ensure server is ready before attempting to send
            try { await a2aReady; } catch {}
            devLogService.log(`[Dispatch] Attempting to send message to ${message.recipient}...`);
            try { console.log(`[Dispatch] Attempting to send message to ${message.recipient}...`); } catch {}
            try {
                try { console.log('[Dispatch] Input message parts:', JSON.stringify((message as any).parts)); } catch {}
                const recipientName = message.recipient ? message.recipient.replace('Agent', '').toLowerCase() : 'unknown';

                // Special handling for OrchestratorAgent (local delivery)
                if (recipientName === 'orchestrator' && orchestratorInstance) {
                    devLogService.log(`[Dispatch] Routing message locally to OrchestratorAgent`);
                    await orchestratorInstance.handleA2AMessage(message);
                    return;
                }

                // Check for dynamic overrides from Settings (Active Profile)
                const activeProfile = configService.getActiveProfile();
                const settingsOverride = activeProfile?.agentOverrides?.find((o: any) => o.agentName === message.recipient);

                let dynamicOverrideUrl = '';
                if (settingsOverride?.useExternal && settingsOverride?.externalUrl) {
                    dynamicOverrideUrl = settingsOverride.externalUrl;
                    if (!dynamicOverrideUrl.endsWith('/card')) {
                         dynamicOverrideUrl = dynamicOverrideUrl.endsWith('/') ? `${dynamicOverrideUrl}card` : `${dynamicOverrideUrl}/card`;
                    }
                }

                // Prefer external override if present (Dynamic > Static JSON > Local)
                const useLocal = !dynamicOverrideUrl && localAgentNames.has(recipientName);
                const cardUrl = dynamicOverrideUrl || (useLocal ? `${agentBaseUrl}/agent/${recipientName}/card` : (a2aOverrides.get(recipientName) || `${agentBaseUrl}/agent/${recipientName}/card`));

                const decisionType = dynamicOverrideUrl ? 'dynamic-override' : (useLocal ? 'local' : (a2aOverrides.has(recipientName) ? 'static-override' : 'local-default'));
                const routeNote = `[Dispatch] Route decision for '${recipientName}': ${decisionType} -> ${cardUrl}`;
                devLogService.log(routeNote);
                try { console.log(routeNote); } catch {}
                let client = a2aClientCache.get(recipientName);
                if (!client) {
                    devLogService.log(`[Dispatch] Creating A2AClient from card URL: ${cardUrl}`);
                    try { console.log(`[Dispatch] Creating A2AClient from card URL: ${cardUrl}`); } catch {}
                    try {
                        client = await A2AClient.fromCardUrl(cardUrl as any);
                    } catch (e: any) {
                        devLogService.log(`[Dispatch] First attempt to fetch card failed (${e?.message}). Retrying once...`);
                        try { console.log(`[Dispatch] First attempt to fetch card failed (${e?.message}). Retrying once...`); } catch {}
                        await new Promise(r => setTimeout(r, 500));
                        client = await A2AClient.fromCardUrl(cardUrl as any);
                    }
                    a2aClientCache.set(recipientName, client);
                }

                devLogService.log(`[Dispatch] Client ready. Sending message...`);
                let result;
                try {
                    // Preserve original envelope with parts for SDK server compatibility.
                    // Add userMessage/task as additional fields for broader compatibility but DO NOT drop parts.
                    let outgoing: any = { ...(message as any) };
                    // Ensure minimum SDK shape
                    if (!outgoing.kind) { outgoing.kind = 'message'; }
                    if (!outgoing.role) { outgoing.role = 'user'; }
                    try { console.log('[Dispatch] Outgoing message preview:', JSON.stringify(outgoing)); } catch {}

                    result = await client.sendMessage({ message: outgoing });
                    try { console.log(`[Dispatch] sendMessage resolved for ${message.recipient}`); } catch {}
                } catch (e: any) {
                    devLogService.log(`[Dispatch] sendMessage failed (${e?.message}). Recreating client and retrying once...`);
                    try { console.warn(`[Dispatch] sendMessage failed (${e?.message}). Recreating client and retrying once...`); } catch {}
                    a2aClientCache.delete(recipientName);
                    client = await A2AClient.fromCardUrl(cardUrl as any);
                    a2aClientCache.set(recipientName, client);
                    let outgoing: any = { ...(message as any) };
                    // Ensure minimum SDK shape
                    if (!outgoing.kind) { outgoing.kind = 'message'; }
                    if (!outgoing.role) { outgoing.role = 'user'; }

                    result = await client.sendMessage({ message: outgoing });
                    try { console.log(`[Dispatch] sendMessage resolved on retry for ${message.recipient}`); } catch {}
                }
                devLogService.log(`[Dispatch] Message successfully sent to ${message.recipient}.`);
                try { console.log(`[Dispatch] Message successfully sent to ${message.recipient}.`); } catch {}
                return result;
            } catch (e: any) {
                console.error(`[DispatchError] Failed to send message to ${message.recipient}:`, e);
                devLogService.log(`[DispatchError] Failed to send message to ${message.recipient}: ${e.message}`);
                throw e;
            }
        };
        console.log(`[extension.ts]   devLogService: ${devLogService}`);
        console.log(`[extension.ts]   context.workspaceState: ${context.workspaceState}`);

        const orchestrator = new OrchestratorAgent(
            dispatch,
            mcpServer as any, // Cast because the imported type is the module, not the class
            llmService,
            authService,
            configService,
            systemPromptFactory,
            context.workspaceState,
            diagnostics,
            devLogService,
            externalAgents
        );
        orchestratorInstance = orchestrator;

        // Register OrchestratorAgent in DI container so AIPartnerViewProvider can resolve it
        CompositionRoot.registerDynamic(ServiceIdentifiers.OrchestratorAgent, orchestrator);

        // Initialize AgentFactory and register all agents
        const { AgentFactory } = require('./agents/core/AgentFactory');
        AgentFactory.getInstance().registerAllAgents();

        // Register main webview provider and bridge messages
        const provider = new AIPartnerViewProvider(context.extensionUri, configService, llmService, context);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(AIPartnerViewProvider.viewType, provider, { webviewOptions: { retainContextWhenHidden: true } })
        );

        // Intercept MCP terminal streaming notifications
        try {
            if (typeof (mcpClient as any).setNotificationHandler === 'function') {
                (mcpClient as any).setNotificationHandler('notifications/terminal/stream', (notification: any) => {
                    const text = notification?.params?.text || '';
                    const commandStr = notification?.params?.command || '';
                    if (text) {
                        provider.postMessage({ command: 'terminal_stream', payload: { text, command: commandStr } });
                    }
                });
            }
        } catch (e) {
            console.warn('[viper] Failed to set MCP notification handler:', e);
        }

        provider.onDidReceiveMessage(async (message: any) => {
            // Handle messages from main AI Partner webview
            try {
                if (message.command === 'acceptAllChanges') {
                    try {
                        const mcp = getMcpClient();
                        if (configService.getCheckpointsEnabled()) { await createCheckpoint('accept-all'); }
                        for (const change of (message.payload || [])) {
                            try {
                                await (mcp as any).callTool({ name: 'FileWriteTool', arguments: { filePath: change.filePath, content: change.modifiedCode } });
                            } catch (inner: any) {
                                const msg = (inner?.message || '').toLowerCase();
                                if (msg.includes('not connected') && typeof (mcp as any).connect === 'function' && (mcp as any).transport) {
                                    await (mcp as any).connect();
                                    await (mcp as any).callTool({ name: 'FileWriteTool', arguments: { filePath: change.filePath, content: change.modifiedCode } });
                                } else {
                                    await fs.mkdir(path.dirname(change.filePath), { recursive: true });
                                    await fs.writeFile(change.filePath, change.modifiedCode, 'utf-8');
                                }
                            }
                        }
                        provider.postMessage({ command: 'diffBatchApplied' });
                        orchestrator.handleUIMessage({ command: 'acceptAllApplied' });
                    } catch (error: any) {
                        vscode.window.showErrorMessage('Failed to apply all changes: ' + (error?.message || error));
                    }
                } else if (message.command === 'declineAllChanges') {
                    orchestrator.handleUIMessage({ command: 'declineAll' });
                } else if (message.command === 'acceptChange' || message.command === 'acceptAlways') {
                    try {
                        const mcp = getMcpClient();
                        const filePath = message.filePath || message.filepath;
                        const suggestionType = message.suggestionType || 'create-file';
                        if (suggestionType === 'command-execution') {
                            const forbidden = [/rm\s+-rf\s+\//i, /shutdown/i, /format\s+/i, /mkfs/i, /reg\s+(add|delete)/i, /sudo\s+/i];
                            const cmd = String(message.modifiedCode || '');
                            if (forbidden.some(r => r.test(cmd))) {
                                vscode.window.showErrorMessage('Forbidden command.');
                                return;
                            }
                            if (configService.getCheckpointsEnabled()) { await createCheckpoint('before-command'); }
                            const t = new TerminalStreamService();
                            provider.postMessage({ command: 'analysis', payload: { text: `Running: ${cmd}` } });
                            t.run(cmd, (data) => {
                                provider.postMessage({ command: 'analysis', payload: { text: data } });
                            }, (code) => {
                                provider.postMessage({ command: 'statusUpdate', payload: { text: `Command exited with code ${code}` } });
                                provider.postMessage({ command: 'hideDiff', payload: { filepath: 'run:command' } });
                                orchestrator.handleUIMessage({
                                    command: 'acceptChangeApplied',
                                    filePath: 'run:command',
                                    suggestionType: suggestionType
                                });
                                t.dispose();
                            });
                        } else {
                            if (configService.getCheckpointsEnabled()) { await createCheckpoint('before-write'); }
                            try {
                                const mc = typeof message.modifiedCode === 'string' ? message.modifiedCode : '';
                                const finalContent = mc && mc.length > 0 ? mc : defaultContentForFile(filePath);
                                await (mcp as any).callTool({ name: 'FileWriteTool', arguments: { filePath, content: finalContent } });
                            } catch (inner: any) {
                                const msg = (inner?.message || '').toLowerCase();
                                if (msg.includes('not connected') && typeof (mcp as any).connect === 'function' && (mcp as any).transport) {
                                    await (mcp as any).connect();
                                    const mc = typeof message.modifiedCode === 'string' ? message.modifiedCode : '';
                                    const finalContent = mc && mc.length > 0 ? mc : defaultContentForFile(filePath);
                                    await (mcp as any).callTool({ name: 'FileWriteTool', arguments: { filePath, content: finalContent } });
                                } else {
                                    await fs.mkdir(path.dirname(filePath), { recursive: true });
                                    const mc = typeof message.modifiedCode === 'string' ? message.modifiedCode : '';
                                    const finalContent = mc && mc.length > 0 ? mc : defaultContentForFile(filePath);
                                    await fs.writeFile(filePath, finalContent, 'utf-8');
                                }
                            }
                        }
                        provider.postMessage({ command: 'hideDiff', payload: { filepath: filePath } });
                        orchestrator.handleUIMessage({
                            command: 'acceptChangeApplied',
                            filePath,
                            suggestionType: suggestionType
                        });
                    } catch (error: any) {
                        vscode.window.showErrorMessage('Failed to apply changes: ' + (error?.message || error));
                    }
                } else if (message.command === 'declineChange') {
                    orchestrator.handleUIMessage(message);
                } else if (message.command === 'previewDiff' && message.payload && message.payload.filePath) {
                    try {
                        const uri = vscode.Uri.file(message.payload.filePath);
                        const doc = await vscode.workspace.openTextDocument(uri);
                        await vscode.window.showTextDocument(doc, { preview: true });
                    } catch (e) {
                        // ignore
                    }
                } else if (message.command === 'focusDiffSummary') {
                    provider.postMessage({ command: 'focusDiffSummary' });
                } else if (message.command === 'showDiff') {
                    vscode.commands.executeCommand(
                        'my-chatbot.showNativeDiff',
                        message.originalCode,
                        message.modifiedCode,
                        message.title
                    );
                } else if (message.command === 'openAttachment') {
                    try {
                        const { uri } = message.payload || {};
                        if (!uri) { return; }
                        const u = vscode.Uri.parse(uri);
                        const doc = await vscode.workspace.openTextDocument(u);
                        await vscode.window.showTextDocument(doc, { preview: true });
                    } catch {}
                } else if (message.command === 'appendActiveFileAttachment') {
                    const editor = vscode.window.activeTextEditor;
                    if (!editor) { return; }
                    const uri = editor.document.uri;
                    provider.postMessage({
                        command: 'insertAttachment',
                        payload: [{ type: 'file', uri: uri.toString(), label: path.basename(uri.fsPath) }]
                    });
                } else if (message.command === 'openFile') {
                    const relativePath = message.filePath;
                    if (relativePath && typeof relativePath === 'string') {
                        try {
                            const wsFolders = vscode.workspace.workspaceFolders;
                            const rootPath = wsFolders && wsFolders.length > 0 ? wsFolders[0].uri.fsPath : '';
                            if (rootPath) {
                                // Clean up path (handle leading slashes on Windows drive letters)
                                let processedPath = relativePath.trim();
                                if (processedPath.startsWith('/') && /^\/[a-zA-Z]:/.test(processedPath)) {
                                    processedPath = processedPath.substring(1);
                                }

                                // path.resolve handles absolute paths correctly by ignoring the root if the second arg is absolute
                                const absolutePath = path.resolve(rootPath, processedPath);
                                // Ensure directory exists
                                await fs.mkdir(path.dirname(absolutePath), { recursive: true });
                                // Check existence, create if missing
                                try {
                                    await fs.access(absolutePath);
                                } catch {
                                    const content = defaultContentForFile(absolutePath);
                                    await fs.writeFile(absolutePath, content, 'utf-8');
                                }
                                const doc = await vscode.workspace.openTextDocument(absolutePath);
                                await vscode.window.showTextDocument(doc);
                            }
                        } catch (e: any) {
                            vscode.window.showErrorMessage('Failed to open file: ' + (e?.message || e));
                        }
                    }
                } else if (message.command === 'relocateTerminal') {
                    const command = message.payload?.command;
                    if (command) {
                        const terminal = vscode.window.createTerminal('Viper Relocated Terminal');
                        terminal.show();
                        terminal.sendText(command);
                    }
                }
                else {
                    orchestrator.handleUIMessage(message);
                }
            } catch (err) {
                console.error('[extension.ts] provider.onDidReceiveMessage error:', err);
            }
        });

        // Semantic Graph Refresh Command
        context.subscriptions.push(
            vscode.commands.registerCommand('viper.refreshSemanticGraph', async () => {
                await semanticModelService.refresh();
            })
        );

        // Semantic Graph Auto-Update on Save
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument(async (doc) => {
                await semanticModelService.onFileSave(doc);
            })
        );

        // Semantic Graph Auto-Update on Create
        context.subscriptions.push(
            vscode.workspace.onDidCreateFiles(async (event) => {
                for (const file of event.files) {
                    await semanticModelService.onFileCreate(file);
                }
            })
        );

        // Semantic Graph Auto-Update on Delete
        context.subscriptions.push(
            vscode.workspace.onDidDeleteFiles(async (event) => {
                for (const file of event.files) {
                    await semanticModelService.onFileDelete(file);
                }
            })
        );

        // 10. Checkpoint commands
        context.subscriptions.push(
            vscode.commands.registerCommand('viper.checkpoint.create', async () => {
                const label = await vscode.window.showInputBox({ prompt: 'Checkpoint label', value: 'manual' });
                await createCheckpoint(label || 'manual');
                vscode.window.showInformationMessage('Checkpoint created.');
            })
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('viper.checkpoint.restore', async () => {
                try {
                    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    if (!ws) { return; }
                    const base = path.join(ws, '.viper', 'checkpoints');
                    const entries: Dirent[] = await fs.readdir(base, { withFileTypes: true }).catch((): Dirent[] => []);
                    const dirs = entries.filter((e: Dirent) => e.isDirectory()).map((e: Dirent) => e.name).sort().reverse();
                    if (dirs.length === 0) { vscode.window.showWarningMessage('No checkpoints found.'); return; }
                    const pick = await vscode.window.showQuickPick(dirs, { placeHolder: 'Select a checkpoint to restore' });
                    if (!pick) { return; }
                    const src = path.join(base, pick);
                    const exclude = new Set(['.git', '.viper', 'node_modules']);
                    const copyBack = async (from: string, to: string) => {
                        const items: Dirent[] = await fs.readdir(from, { withFileTypes: true });
                        for (const it of items) {
                            if (exclude.has(it.name)) { continue; }
                            const s = path.join(from, it.name);
                            const d = path.join(to, it.name);
                            if (it.isDirectory()) {
                                await fs.mkdir(d, { recursive: true });
                                await copyBack(s, d);
                            } else if (it.isFile()) {
                                const data = await fs.readFile(s);
                                await fs.writeFile(d, data);
                            }
                        }
                    };
                    await copyBack(src, ws);
                    vscode.window.showInformationMessage(`Restored checkpoint: ${pick}`);
                } catch (e: any) {
                    vscode.window.showErrorMessage('Failed to restore checkpoint: ' + (e?.message || e));
                }
            })
        );

        // HLE Evaluation Command
        context.subscriptions.push(
            vscode.commands.registerCommand('viper.startEvaluation', async () => {
                const datasetUrl = await vscode.window.showInputBox({
                    prompt: 'Dataset URL or Name (e.g., cais/hle)',
                    value: 'cais/hle'
                });
                if (!datasetUrl) {
                    return;
                }

                const hfToken = await vscode.window.showInputBox({
                    prompt: 'Hugging Face API Token (optional for public datasets)',
                    password: true
                });

                const evaluator = new HLEEvaluator(context, orchestrator);
                try {
                    await evaluator.initialize(hfToken, datasetUrl);
                    vscode.window.showInformationMessage('Starting HLE Evaluation...');
                    await evaluator.runFullEvaluation();
                } catch (e) {
                    vscode.window.showErrorMessage(`Evaluation failed: ${e}`);
                }
            })
        );

        // Multi-SWE-bench Evaluation
        context.subscriptions.push(
            vscode.commands.registerCommand('viper.runMultiSWEBench', async () => {
                try {
                    const { MultiSWEEvaluator } = await import('./testing/MultiSWE/MultiSWEEvaluator');
                    const evaluator = new MultiSWEEvaluator(context, orchestrator);
                    await evaluator.initialize();
                    const taskId = await vscode.window.showInputBox({
                        prompt: 'Enter Instance ID (e.g. org__repo-123) or leave empty to pick from list',
                        placeHolder: 'org__repo-123'
                    });

                    if (taskId) {
                        try {
                            // Execute Immediately (Benchmark Mode)
                            // runTask handles setup internally.
                            await evaluator.runTask(taskId, orchestrator);
                            vscode.window.showInformationMessage(`Task ${taskId} setup. Reloading window to start...`);
                        } catch (e) {
                            vscode.window.showErrorMessage(`Multi-SWE-bench Error: ${e}`);
                        }
                    } else {
                         vscode.window.showInformationMessage('No Task ID provided. Setup skipped.');
                    }
                } catch (e) {
                    if ((e as any).code === 'MODULE_NOT_FOUND' || (e as any).message?.includes('MultiSWEEvaluator')) {
                        vscode.window.showWarningMessage('Multi-SWE-bench module not found. Please add the MultiSWEEvaluator implementation.');
                    } else {
                        vscode.window.showErrorMessage(`Error: ${e}`);
                    }
                }
            })
        );

        // Resume Multi-SWE if pending (async to avoid blocking activation)
        import('./testing/MultiSWE/MultiSWEEvaluator')
            .then(({ MultiSWEEvaluator }) => {
                const sweValuator = new MultiSWEEvaluator(context, orchestrator);
                sweValuator.checkForPendingTask().catch(e => console.error(e));
            })
            .catch(() => {
                // MultiSWEEvaluator not available, silently skip
                console.log('[viper] MultiSWEEvaluator not found, skipping pending task check');
            });

        // Grade Multi-SWE-bench
        context.subscriptions.push(
            vscode.commands.registerCommand('viper.gradeMultiSWEBench', async () => {
                try {
                    const { MultiSWEEvaluator } = await import('./testing/MultiSWE/MultiSWEEvaluator');
                    const evaluator = new MultiSWEEvaluator(context, orchestrator);
                    await evaluator.initialize();
                    const taskId = await vscode.window.showInputBox({
                        prompt: 'Enter Instance ID to Grade (e.g. org__repo-123)',
                        placeHolder: 'org__repo-123'
                    });

                    if (taskId) {
                       await evaluator.gradeTask(taskId);
                    }
                } catch (e) {
                    if ((e as any).code === 'MODULE_NOT_FOUND' || (e as any).message?.includes('MultiSWEEvaluator')) {
                        vscode.window.showWarningMessage('Multi-SWE-bench module not found. Please add the MultiSWEEvaluator implementation.');
                    } else {
                        vscode.window.showErrorMessage(`Grading failed: ${e}`);
                    }
                }
            })
        );

        // API Key Setters
        context.subscriptions.push(
            vscode.commands.registerCommand('viper.setTavilyApiKey', async () => {
                const key = await vscode.window.showInputBox({
                    prompt: 'Enter Tavily API Key',
                    placeHolder: 'tvly-...',
                    password: true
                });
                if (key) {
                    await configService.setTavilyApiKey(key);
                    vscode.window.showInformationMessage('Tavily API Key updated.');
                }
            })
        );

        const startResult: any = await startA2AServer(context, agentBaseUrl, dispatch, mcpServer, llmService, authService, configService, diagnostics, devLogService, orchestrator);
        const { close: closeA2AServer, registeredAgentConfigs } = startResult;
        console.log('[viper] [extension.ts] A2A server started.');
        try { if (typeof a2aReadyResolve === 'function') { a2aReadyResolve(); } a2aReadyResolve = undefined; } catch {}
        context.subscriptions.push({ dispose: closeA2AServer });

        // Populate local agent names from the server's registered configs (exclude OrchestratorAgent)
        try {
            localAgentNames.clear();
            for (const cfg of registeredAgentConfigs) {
                const rawName = (cfg?.card?.name ?? cfg?.name) as string | undefined;
                if (typeof rawName === 'string' && rawName && rawName !== 'OrchestratorAgent') {
                    const rec = rawName.replace(/Agent$/, '').toLowerCase();
                    localAgentNames.add(rec);
                    // Ensure overrides don't hijack locally mounted agents
                    try { a2aOverrides.delete(rec); } catch {}
                }
            }
            devLogService.log(`[Dispatch] Local agents registered: ${Array.from(localAgentNames).join(', ')}`);
        } catch {}

        await orchestrator.initialize(registeredAgentConfigs.map((config: any) => config.card));

        // 5. Register the diff command
        context.subscriptions.push(
            vscode.commands.registerCommand('my-chatbot.showNativeDiff', async (originalCode: string, modifiedCode: string, title: string) => {
                const tempDir = os.tmpdir();
                // Use a unique name to avoid collisions
                const originalFileName = `original-${Date.now()}.ts`;
                const modifiedFileName = `modified-${Date.now()}.ts`;

                const originalFile = path.join(tempDir, originalFileName);
                const modifiedFile = path.join(tempDir, modifiedFileName);

                try {
                    await fs.writeFile(originalFile, originalCode);
                    await fs.writeFile(modifiedFile, modifiedCode);

                    const originalUri = vscode.Uri.file(originalFile);
                    const modifiedUri = vscode.Uri.file(modifiedFile);

                    await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title);
                } catch (error) {
                    console.error('Error showing diff:', error);
                    vscode.window.showErrorMessage('Could not generate the code comparison.');
                } finally {
                    // Clean up the temporary files
                    try {
                        await fs.unlink(originalFile);
                        await fs.unlink(modifiedFile);
                    } catch (cleanupError) {
                        console.error('Error cleaning up temp diff files:', cleanupError);
                    }
                }
            })
        );



        // 5. Register the diff-in-webview command with Show in Main View support
        context.subscriptions.push(
            vscode.commands.registerCommand('my-chatbot.showDiffInWebview', async (originalFilePath: string, originalCode: string, modifiedCode: string) => {
                const panel = vscode.window.createWebviewPanel(
                    'diffWebview',
                    `Diff: ${path.basename(originalFilePath)}`,
                    vscode.ViewColumn.Beside,
                    { enableScripts: true }
                );
                panel.webview.html = getWebviewContent(originalFilePath, originalCode, modifiedCode);

                const disp = panel.webview.onDidReceiveMessage(async (msg) => {
                    if (!msg || typeof msg.command !== 'string') { return; }
                    switch (msg.command) {
                        case 'showInMainView': {
                            try {
                                const patch = jsdiff.createPatch(originalFilePath, originalCode, modifiedCode);
                                let diffHtml = '<pre><code>';
                                let addedLines = 0;
                                let removedLines = 0;
                                patch.split('\n').forEach(line => {
                                    if (line.startsWith('+') && !line.startsWith('+++')) { addedLines++; diffHtml += `<span style="color: green;">${line}</span>\n`; }
                                    else if (line.startsWith('-') && !line.startsWith('---')) { removedLines++; diffHtml += `<span style="color: red;">${line}</span>\n`; }
                                    else { diffHtml += `${line}\n`; }
                                });
                                diffHtml += '</code></pre>';
                                provider.postMessage({
                                    command: 'displayDiffInChatBubble',
                                    payload: {
                                        diffHtml,
                                        originalCode,
                                        modifiedCode,
                                        title: `Diff: ${path.basename(originalFilePath)}`,
                                        filePath: originalFilePath,
                                        suggestionType: 'edit-file',
                                        addedLines,
                                        removedLines
                                    }
                                });
                                try { disp.dispose(); } catch {}
                                try { panel.dispose(); } catch {}
                            } catch (e: any) {
                                vscode.window.showErrorMessage('Failed to show diff in main view: ' + (e?.message || e));
                            }
                            break;
                        }
                        case 'acceptChange':
                        case 'acceptAlways': {
                            try {
                                const mcp = getMcpClient();
                                const filePath = msg.filepath || originalFilePath;
                                if (configService.getCheckpointsEnabled()) { await createCheckpoint('before-write'); }
                                const finalContent = typeof msg.modifiedCode === 'string' && msg.modifiedCode.length > 0 ? msg.modifiedCode : modifiedCode;
                                await (mcp as any).callTool({ name: 'FileWriteTool', arguments: { filePath, content: finalContent } });
                                provider.postMessage({ command: 'hideDiff', payload: { filepath: filePath } });
                                orchestrator.handleUIMessage({ command: 'acceptChangeApplied', filePath, suggestionType: 'edit-file' });
                                try { disp.dispose(); } catch {}
                                try { panel.dispose(); } catch {}
                            } catch (error: any) {
                                vscode.window.showErrorMessage('Failed to apply changes: ' + (error?.message || error));
                            }
                            break;
                        }
                        case 'declineChange': {
                            try { disp.dispose(); } catch {}
                            try { panel.dispose(); } catch {}
                            break;
                        }
                        default:
                            break;
                    }
                });
            })
        );

        // Relay orchestrator->UI messages to the main webview
        orchestrator.onDidPostMessage(message => {
            // Check if this is already a UI command (has command property)
            // If it's a raw data structure from Agent, transform it using Presentation Layer
            if (message && typeof message === 'object' && 'command' in message) {
                // Already a UI command, send directly
                provider.postMessage(message);
            } else {
                // Raw agent data, transform using Presentation Layer
                // Convert to A2A message format if needed
                const { PresentationMessageFactory } = require('./messaging/PresentationMessageFactory');
                const uiCommands = PresentationMessageFactory.transformToUI(message as any);
                if (uiCommands) {
                    if (Array.isArray(uiCommands)) {
                        uiCommands.forEach(cmd => provider.postMessage(cmd));
                    } else {
                        provider.postMessage(uiCommands);
                    }
                } else {
                    // Fallback: send as-is
                    provider.postMessage(message);
                }
            }
        });

        // 7. Handle agent list updates for the UI
        const serversConfigPath = path.join(context.extensionPath, '.agent', 'a2a-servers.json');

        async function updateAndPostAgentList() {
            try {
                const serversConfigContent = await fs.readFile(serversConfigPath, 'utf-8');
                const agentConfigs = JSON.parse(serversConfigContent);
                provider.postMessage({ command: 'updateAgentList', agents: agentConfigs });
            } catch (error) {
                console.error('Error reading or parsing a2a-servers.json:', error);
                vscode.window.showErrorMessage('Could not load A2A agent configuration.');
                provider.postMessage({ command: 'updateAgentList', agents: [] });
            }
        }

        updateAndPostAgentList(); // Initial load
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(path.join(context.extensionPath, '.agent'), 'a2a-servers.json')
        );
        watcher.onDidChange(() => updateAndPostAgentList());
        context.subscriptions.push(watcher);

        // 8. Load and watch MCP servers config for UI visibility (no process spawning here)
        const mcpServersPath = path.join(context.extensionPath, '.agent', 'mcp-servers.json');
        async function updateAndPostMcpServers() {
            try {
                const content = await fs.readFile(mcpServersPath, 'utf-8');
                const parsed = JSON.parse(content);
                provider.postMessage({ command: 'updateMcpServers', payload: parsed });
            } catch (error) {
                console.warn('Could not load mcp-servers.json:', error);
                provider.postMessage({ command: 'updateMcpServers', payload: { mcpServers: {} } });
            }
        }
        await updateAndPostMcpServers();
        const mcpWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(path.join(context.extensionPath, '.agent'), 'mcp-servers.json')
        );
        mcpWatcher.onDidChange(() => updateAndPostMcpServers());
        context.subscriptions.push(mcpWatcher);

        // 9. Context menu commands: Explorer and Editor selection -> to Viper
        context.subscriptions.push(
            vscode.commands.registerCommand('viper.toViper', async (resource: vscode.Uri, resources?: vscode.Uri[]) => {
                try {
                    const list: vscode.Uri[] = Array.isArray(resources) && resources.length ? resources : (resource ? [resource] : []);
                    if (list.length === 0) { return; }
                    const items = await Promise.all(list.map(async (uri) => {
                        try {
                            const stat = await vscode.workspace.fs.stat(uri);
                            const isFolder = stat.type === vscode.FileType.Directory;
                            return { type: isFolder ? 'folder' : 'file', uri: uri.toString(), label: path.basename(uri.fsPath) };
                        } catch {
                            return { type: 'file', uri: uri.toString(), label: path.basename(uri.fsPath) };
                        }
                    }));
                    provider.postMessage({ command: 'insertAttachment', payload: items });
                } catch {
                    // ignore
                }
            })
        );
        // Editor context menu when no selection: send active file to Viper
        context.subscriptions.push(
            vscode.commands.registerCommand('viper.toViperActiveFile', async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) { return; }
                const uri = editor.document.uri;
                provider.postMessage({
                    command: 'insertAttachment',
                    payload: [{ type: 'file', uri: uri.toString(), label: path.basename(uri.fsPath) }]
                });
            })
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('viper.toViperSelection', async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) { return; }
                const sel = editor.selection;
                const text = editor.document.getText(sel);
                if (!text) { return; }
                provider.postMessage({
                    command: 'insertAttachment',
                    payload: [{ type: 'code', uri: editor.document.uri.toString(), label: `${path.basename(editor.document.uri.fsPath)}:${sel.start.line + 1}-${sel.end.line + 1}`, content: text }]
                });
            })
        );

    } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to activate Viper: ${e.message}`);
        console.error("Error during activation:", e);
    }
}

export function deactivate() {
    // Deactivation logic will be handled by the server closing and other subscriptions.
}
