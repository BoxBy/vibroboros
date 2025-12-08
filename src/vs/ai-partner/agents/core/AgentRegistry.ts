import { AgentExecutor } from "@a2a-js/sdk/server";

/**
 * Central registry for managing agent instances.
 * Replaces hardcoded switch-cases for agent retrieval.
 */
export class AgentRegistry {
    private static instance: AgentRegistry;
    private agents: Map<string, AgentExecutor> = new Map();

    private constructor() {}

    public static getInstance(): AgentRegistry {
        if (!AgentRegistry.instance) {
            AgentRegistry.instance = new AgentRegistry();
        }
        return AgentRegistry.instance;
    }

    public register(name: string, agent: AgentExecutor): void {
        this.agents.set(name, agent);
        console.log(`[AgentRegistry] Registered agent: ${name}`);
    }

    public get(name: string): AgentExecutor | undefined {
        return this.agents.get(name);
    }

    public getAllNames(): string[] {
        return Array.from(this.agents.keys());
    }
}
