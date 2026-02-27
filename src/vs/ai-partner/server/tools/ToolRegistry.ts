/**
 * Tool Registry
 * Registry for MCP tools
 */

export interface ToolDefinition {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: any;
        outputSchema: any;
    };
    handler: (input: any) => Promise<any>;
}

export class ToolRegistry {
    private static instance: ToolRegistry;
    private tools = new Map<string, ToolDefinition>();

    private constructor() {}

    public static getInstance(): ToolRegistry {
        if (!ToolRegistry.instance) {
            ToolRegistry.instance = new ToolRegistry();
        }
        return ToolRegistry.instance;
    }

    public static setInstance(instance: ToolRegistry): void {
        ToolRegistry.instance = instance;
    }

    public registerTool(tool: ToolDefinition): void {
        this.tools.set(tool.name, tool);
    }

    /**
     * Register a tool (alias for registerTool)
     */
    public register(tool: ToolDefinition): void {
        this.registerTool(tool);
    }

    public getTool(name: string): ToolDefinition | undefined {
        return this.tools.get(name);
    }

    public getAllTools(): ToolDefinition[] {
        return Array.from(this.tools.values());
    }

    /**
     * Alias for getAll() - MCP SDK compatibility
     */
    public getAll(): ToolDefinition[] {
        return this.getAllTools();
    }

    public hasTool(name: string): boolean {
        return this.tools.has(name);
    }

    /**
     * Get information about registered tools
     */
    public getInfo(): { count: number; tools: string[] } {
        return {
            count: this.tools.size,
            tools: Array.from(this.tools.keys())
        };
    }
}
