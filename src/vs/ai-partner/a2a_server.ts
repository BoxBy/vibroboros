import { A2AExpressApp } from "@a2a-js/sdk/dist/server/express";
import express from "express";
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentExecutor, AgentCard } from "@a2a-js/sdk";
import { ConfigService } from "./config_service";

interface AgentInfo {
    path: string;
    card: AgentCard;
    constructor: new (...args: any[]) => AgentExecutor;
}

export async function startA2AServer(context: vscode.ExtensionContext, agentBaseUrl: string) {
    const server = express();
    server.use(express.json());

    const serversConfigPath = path.join(context.extensionPath, '.agent', 'a2a-servers.json');
    const serversConfigContent = await fs.readFile(serversConfigPath, 'utf-8');
    const agentConfigs: { path: string, card: AgentCard }[] = JSON.parse(serversConfigContent);

    const agents: AgentInfo[] = [];

    for (const config of agentConfigs) {
        const agentPath = path.join(context.extensionPath, 'src', 'vs', 'ai-partner', config.path);
        const module = await import(agentPath);
        const agentClassName = Object.keys(module).find(key => key.endsWith('Agent'));
        if (agentClassName) {
            const constructor = module[agentClassName];
            agents.push({ ...config, constructor });
        }
    }

    agents.forEach(agentInfo => {
        const agent = new agentInfo.constructor(agentBaseUrl, agents.map(a => a.path), context.workspaceState, agentInfo.card);
        const app = new A2AExpressApp(agent);
        server.use(`/agent/${agentInfo.card.name.replace('Agent', '').toLowerCase()}`, app.router);
    });

    const configService = ConfigService.getInstance();
    const port = configService.getA2AServerPort();
    const listener = server.listen(port, () => {
        console.log(`A2A Server listening on port ${port}`);
        console.log('Registered agents:');
        agents.forEach(agent => {
            console.log(`- ${agent.card.name} at /agent/${agent.card.name.replace('Agent', '').toLowerCase()}`);
        });
    });

    return {
        close: () => listener.close(),
        server: server
    };
}