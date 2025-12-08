import { McpServer } from '@modelcontextprotocol/sdk/server';
export declare class InProcessMcpTransport implements McpClientTransport {
    private server;
    constructor(server: McpServer);
    postMessage(message: any): Promise<any>;
    [Symbol.asyncDispose](): Promise<void>;
}
