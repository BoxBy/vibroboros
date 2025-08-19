import { ChildProcess } from 'child_process';
import { JsonRpcRequest, JsonRpcResponse, InitializeParams, InitializeResult, ClientCapabilities, ClientInfo, ToolsListResult, ToolsCallParams, ToolsCallResult, JsonRpcNotification } from './mcp';

/**
 * Manages the connection and communication with a single MCP server process.
 */
export class McpClient {
    private nextId = 1;
    private pendingRequests = new Map<number, (response: JsonRpcResponse) => void>();

    constructor(private serverProcess: ChildProcess, private serverName: string) {
        this.serverProcess.stdout?.on('data', (data) => this.handleData(data));
        this.serverProcess.stderr?.on('data', (data) => this.handleErrorData(data));
        this.serverProcess.on('close', () => this.handleClose());
    }

    private handleData(data: Buffer) {
        try {
            const message: JsonRpcResponse = JSON.parse(data.toString());
            if (message.id && this.pendingRequests.has(message.id as number)) {
                const callback = this.pendingRequests.get(message.id as number)!;
                callback(message);
                this.pendingRequests.delete(message.id as number);
            }
        } catch (error) {
            console.error(`[${this.serverName}] Error parsing JSON-RPC message:`, error);
        }
    }

    private handleErrorData(data: Buffer) {
        console.error(`[${this.serverName}-stderr]: ${data.toString()}`);
    }

    private handleClose() {
        console.log(`[${this.serverName}] Connection closed.`);
        this.pendingRequests.forEach((callback) => {
            callback({ jsonrpc: '2.0', id: -1, error: { code: -32099, message: 'Connection closed' } });
        });
        this.pendingRequests.clear();
    }

    public sendRequest(method: string, params: any): Promise<JsonRpcResponse> {
        return new Promise((resolve, reject) => {
            const id = this.nextId++;
            const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
            this.pendingRequests.set(id, resolve);
            const payload = JSON.stringify(request) + '\n';
            this.serverProcess.stdin?.write(payload, (err) => {
                if (err) {
                    this.pendingRequests.delete(id);
                    return reject(err);
                }
            });
        });
    }

    public async initialize(): Promise<InitializeResult> {
        const clientInfo: ClientInfo = { name: 'vscode-ai-partner', version: '0.0.1' };
        const capabilities: ClientCapabilities = { elicitation: {} };
        const params: InitializeParams = { protocolVersion: '2025-06-18', clientInfo, capabilities };
        const response = await this.sendRequest('initialize', params);
        if (response.error) {
            throw new Error(`Initialization failed: ${response.error.message}`);
        }
        const initializedNotification: JsonRpcNotification = { jsonrpc: '2.0', method: 'initialized', params: {} };
        this.serverProcess.stdin?.write(JSON.stringify(initializedNotification) + '\n');
        return response.result as InitializeResult;
    }

    public async listTools(): Promise<ToolsListResult> {
        const response = await this.sendRequest('tools/list', {});
        if (response.error) {
            throw new Error(`Failed to list tools: ${response.error.message}`);
        }
        return response.result as ToolsListResult;
    }

    /**
     * Calls a specific tool on the server.
     * @param params The parameters for the tool call, including name and arguments.
     * @returns A promise that resolves with the result of the tool call.
     */
    public async callTool(params: ToolsCallParams): Promise<ToolsCallResult> {
        const response = await this.sendRequest('tools/call', params);
        if (response.error) {
            throw new Error(`Tool call failed: ${response.error.message}`);
        }
        return response.result as ToolsCallResult;
    }

    public dispose() {
        console.log(`[${this.serverName}] Disposing client and terminating server process.`);
        this.serverProcess.kill();
        this.handleClose();
    }
}
