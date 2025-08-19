import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { A2AClient } from './a2a_client';
import { AgentCard, MessageSendParams, StreamEvent, Task } from './core_data_structures';
import { v4 as uuidv4 } from 'uuid';
import { MainViewProvider } from './main_view_provider';
import { TaskStore } from './task_store';

interface AgentServerConfig {
    name: string;
    configKey: string; // e.g., 'docGen'
    scriptPath: string;
    port: number;
    commandId: string;
}

const agentServers = new Map<string, ChildProcess>();
const runningTaskControllers = new Map<string, AbortController>();
let taskStore: TaskStore;
let mainViewProvider: MainViewProvider;

export async function activate(context: vscode.ExtensionContext) {
    // ... (activate function setup is the same)
    console.log('Activating Vibroboros AI Partner.');

    taskStore = TaskStore.getInstance(context);
    await vscode.workspace.fs.createDirectory(context.globalStorageUri);

    const agentConfigs: AgentServerConfig[] = [
        { name: 'DocGenAgent', configKey: 'docGen', scriptPath: path.join(context.extensionPath, 'src', 'vs', 'ai-partner', 'agents', 'doc_gen_server.ts'), port: 41242, commandId: 'vibroboros.generate_documentation' },
        { name: 'RefactoringAgent', configKey: 'refactoring', scriptPath: path.join(context.extensionPath, 'src', 'vs', 'ai-partner', 'agents', 'refactoring_suggestion_server.ts'), port: 41243, commandId: 'vibroboros.get_refactoring_suggestions' },
        { name: 'CodeAnalysisAgent', configKey: 'codeAnalysis', scriptPath: path.join(context.extensionPath, 'src', 'vs', 'ai-partner', 'agents', 'code_analysis_server.ts'), port: 41244, commandId: 'vibroboros.summarize_code' },
    ];

    agentConfigs.forEach(config => launchAgentServer(config, context));

    mainViewProvider = new MainViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(MainViewProvider.viewType, mainViewProvider)
    );
    // ... (rest of activate is the same)
}

function launchAgentServer(config: AgentServerConfig, context: vscode.ExtensionContext) {
    const agentConfig = vscode.workspace.getConfiguration('vibroboros.agent').get(config.configKey);
    const apiKeys = vscode.workspace.getConfiguration('vibroboros.llm').get('apiKeys');

    // Combine agent-specific config with global config (like API keys)
    const fullConfig = {
        ...agentConfig,
        apiKeys: apiKeys
    };

    const configJsonString = JSON.stringify(fullConfig);
    const configArg = Buffer.from(configJsonString).toString('base64');

    const serverProcess = spawn('npx', ['ts-node', config.scriptPath, configArg], { shell: true, cwd: context.extensionPath });

    agentServers.set(config.name, serverProcess);
    serverProcess.stdout.on('data', (data) => console.log(`[${config.name}-stdout]: ${data}`));
    serverProcess.stderr.on('data', (data) => console.error(`[${config.name}-stderr]: ${data}`));
    serverProcess.on('close', (code) => {
        console.log(`[${config.name}] server process exited with code ${code}`);
        agentServers.delete(config.name);
    });
}

// ... (rest of the file remains the same)
