import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { startA2AServer } from './a2a_server';
import { A2AClientSDK } from './a2a_client';
import { AIPartnerViewProvider } from './AIPartnerViewProvider';
import { UIAgent } from './agents/ui_agent';
import { createMCPServer } from './server/MCPServer';
import { InProcessMcpTransport } from './mcp_in_process_transport';
import { McpClient } from '@modelcontextprotocol/sdk';
import { setMcpClient } from './mcp_client_provider';
import { ConfigService } from './config_service';

export function activate(context: vscode.ExtensionContext) {
    console.log('AI Partner extension is now active.');

    try {
        ConfigService.initialize(context.extensionPath);
        const configService = ConfigService.getInstance();

        // 1. Start the MCP server
        const mcpServer = createMCPServer();
        const mcpTransport = new InProcessMcpTransport(mcpServer);
        const mcpClient = new McpClient({ transport: mcpTransport });
        setMcpClient(mcpClient);

        // 2. Start the A2A server
        const port = configService.getA2AServerPort();
        const agentBaseUrl = `http://localhost:${port}`;
        const a2aServer = startA2AServer(context, agentBaseUrl);
        context.subscriptions.push({ dispose: () => a2aServer.close() });

        // 3. Initialize the UI
        const a2aClient = new A2AClientSDK(`${agentBaseUrl}/agent/orchestrator`);
        const uiAgent = new UIAgent(a2aClient);

        const provider = new AIPartnerViewProvider(context.extensionUri);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(AIPartnerViewProvider.viewType, provider)
        );

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

        // Initial load
        updateAndPostAgentList();

        // Watch for changes
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(path.join(context.extensionPath, '.agent'), 'a2a-servers.json'));
        watcher.onDidChange(() => updateAndPostAgentList());
        context.subscriptions.push(watcher);

        provider.onDidReceiveMessage(async (message) => {
            if (message.command === 'sendMessage') {
                try {
                    await uiAgent.sendRequestAndStreamResponse(message.text, (event) => {
                        provider.postMessage({ command: 'streamEvent', event });
                    });
                } catch (e: any) {
                    provider.postMessage({ command: 'error', error: e.message });
                }
            } else if (message.command === 'addAgent') {
                try {
                    const currentAgents = JSON.parse(await fs.readFile(serversConfigPath, 'utf-8'));
                    currentAgents.push(message.agent);
                    await fs.writeFile(serversConfigPath, JSON.stringify(currentAgents, null, 4));
                } catch (error) {
                    console.error('Error adding agent:', error);
                    vscode.window.showErrorMessage('Failed to add A2A agent.');
                }
            } else if (message.command === 'removeAgent') {
                try {
                    let currentAgents = JSON.parse(await fs.readFile(serversConfigPath, 'utf-8'));
                    currentAgents = currentAgents.filter((agent: any) => agent.card.name !== message.agentName);
                    await fs.writeFile(serversConfigPath, JSON.stringify(currentAgents, null, 4));
                } catch (error) {
                    console.error('Error removing agent:', error);
                    vscode.window.showErrorMessage('Failed to remove A2A agent.');
                }
            }
        });

    } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to activate AI Partner: ${e.message}`);
        console.error("Error during activation:", e);
    }
}

export function deactivate() {
    // Deactivation logic will be handled by the server closing.
}