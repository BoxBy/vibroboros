
import { McpClient } from '@modelcontextprotocol/sdk';

let client: McpClient;

export function setMcpClient(newClient: McpClient) {
    client = newClient;
}

export function getMcpClient(): McpClient {
    return client;
}
