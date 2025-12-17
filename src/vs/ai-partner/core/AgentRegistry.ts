import * as vscode from 'vscode';
import { McpClient } from '../../mcp_client_provider'; // Assuming this exists or will be refactored

export interface AgentInfo {
    id: string;
    name: string;
    description: string;
    type: 'internal' | 'external' | 'mcp';
    override?: boolean;
}

export class AgentRegistry {
    private agents: Map<string, AgentInfo> = new Map();
    private mcpTools: Map<string, any> = new Map(); // Store MCP tools by name to prevent duplicates

    constructor() {}

    public registerAgent(agent: AgentInfo) {
        if (this.agents.has(agent.id)) {
            const existing = this.agents.get(agent.id);
            if (existing?.override) {
                 // Already overridden, ignore unless force? For now, we assume external overrides happen once.
                 return;
            }
        }
        this.agents.set(agent.id, agent);
    }

    public getAgent(id: string): AgentInfo | undefined {
        return this.agents.get(id);
    }

    public getAllAgents(): AgentInfo[] {
        return Array.from(this.agents.values());
    }

    public registerMCPTool(toolName: string, toolDefinition: any) {
        // Enforce uniqueness. If a tool with the same name exists, we might want to warn or skip.
        if (this.mcpTools.has(toolName)) {
            console.warn(`MCP Tool ${toolName} is already registered. Skipping duplicate.`);
            return;
        }
        this.mcpTools.set(toolName, toolDefinition);
    }
    
    public getMCPTools(): Map<string, any> {
        return this.mcpTools;
    }
}
