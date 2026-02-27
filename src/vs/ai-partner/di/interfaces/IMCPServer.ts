/**
 * Interface for MCP Server
 * Manages Model Context Protocol server functionality
 */

export interface IMCPServer {
    /**
     * Start the MCP server
     */
    start(): Promise<void>;

    /**
     * Stop the MCP server
     */
    stop(): Promise<void>;

    /**
     * Check if server is running
     */
    isRunning(): boolean;

    /**
     * Get server info
     */
    getServerInfo(): { name: string; version: string };
}

export interface IMCPToolService {
    /**
     * Register a tool
     */
    registerTool(tool: any): void;

    /**
     * Get a tool by name
     */
    getTool(name: string): any | undefined;

    /**
     * List all tools
     */
    listTools(): any[];

    /**
     * Execute a tool
     */
    executeTool(name: string, input: any): Promise<any>;
}

export interface IMCPManager {
    /**
     * Get all registered servers
     */
    getServers(): IMCPServer[];

    /**
     * Get a server by name
     */
    getServer(name: string): IMCPServer | undefined;

    /**
     * Register a server
     */
    registerServer(server: IMCPServer): void;

    /**
     * Start all servers
     */
    startAll(): Promise<void>;

    /**
     * Stop all servers
     */
    stopAll(): Promise<void>;
}

export interface IMCPHealthCheckService {
    /**
     * Check health of all MCP servers
     */
    checkHealth(): Promise<Map<string, boolean>>;

    /**
     * Check health of a specific server
     */
    checkServerHealth(serverName: string): Promise<boolean>;
}
