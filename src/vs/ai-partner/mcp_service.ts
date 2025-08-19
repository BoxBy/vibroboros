import { McpClient } from "./mcp_client";

/**
 * A singleton service to manage all active MCP clients.
 * This provides a centralized point of access for agents to interact with MCP servers.
 */
export class McpService {
    private static instance: McpService;
    private clients = new Map<string, McpClient>();
    private statusChangeCallback: ((clients: string[]) => void) | undefined;

    private constructor() { }

    public static getInstance(): McpService {
        if (!McpService.instance) {
            McpService.instance = new McpService();
        }
        return McpService.instance;
    }

    /**
     * Registers a callback to be invoked when the list of clients changes.
     * @param callback The function to call with the new list of client names.
     */
    public onClientStatusChange(callback: (clients: string[]) => void): void {
        this.statusChangeCallback = callback;
    }

    private notifyStatusChange(): void {
        if (this.statusChangeCallback) {
            this.statusChangeCallback(this.listClientNames());
        }
    }

    public registerClient(name: string, client: McpClient): void {
        this.clients.set(name, client);
        console.log(`[McpService] Client registered: ${name}`);
        this.notifyStatusChange();
    }

    public unregisterClient(name: string): void {
        if (this.clients.has(name)) {
            // The dispose method is called by the extension deactivate hook.
            // Here we just remove it from the list.
            this.clients.delete(name);
            console.log(`[McpService] Client unregistered: ${name}`);
            this.notifyStatusChange();
        }
    }

    public getClient(name: string): McpClient | undefined {
        return this.clients.get(name);
    }

    public listClientNames(): string[] {
        return Array.from(this.clients.keys());
    }

    public disposeAll(): void {
        console.log("[McpService] Disposing all clients...");
        this.clients.forEach((client, name) => {
            console.log(`[McpService] Disposing client: ${name}`);
            client.dispose();
        });
        this.clients.clear();
        this.notifyStatusChange();
    }
}
