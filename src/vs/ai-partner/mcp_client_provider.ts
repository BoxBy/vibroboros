import * as mcpClientModule from '@modelcontextprotocol/sdk/client';

let client: mcpClientModule.Client;

export function setMcpClient(newClient: mcpClientModule.Client) {
    client = newClient;
}

export function getMcpClient(): mcpClientModule.Client {
    if (!client) {
        throw new Error("MCP Client has not been initialized.");
    }
    return client;
}
