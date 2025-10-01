import { McpServer, McpClientTransport, JsonRpcRequest } from '@modelcontextprotocol/sdk';

export class InProcessMcpTransport implements McpClientTransport {
    constructor(private server: McpServer) {}

    async postMessage(message: JsonRpcRequest): Promise<any> {
        return this.server.handleRequest(message);
    }

    [Symbol.asyncDispose](): Promise<void> {
        return Promise.resolve();
    }
}