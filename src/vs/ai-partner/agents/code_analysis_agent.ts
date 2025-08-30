import { Agent } from "../agent";
import { McpService } from "../mcp_service";
import { A2AMessage } from "../interfaces/A2AMessage";

interface McpToolCallRequestPayload {
    serverName: string;
    toolName: string;
    args: Record<string, unknown>;
}

/**
 * Analyzes code and interacts with MCP servers for tool-related functionalities.
 */
export class CodeAnalysisAgent extends Agent {
    public async handleMessage(message: A2AMessage<any>): Promise<void> {
        console.log(`[${this.name}] received message of type "${message.type}" from [${message.sender}].`);

        switch (message.type) {
            case 'list_mcp_tools':
                await this.handleListMcpTools(message);
                break;

            case 'call_mcp_tool':
                await this.handleCallMcpTool(message);
                break;

            default:
                await this.sendMessage({
                    sender: this.name,
                    recipient: message.sender,
                    type: 'response',
                    payload: { status: 'Acknowledged', originalType: message.type },
                    timestamp: new Date().toISOString(),
                    correlationId: message.correlationId
                });
                break;
        }
    }

    private async handleListMcpTools(message: A2AMessage<any>): Promise<void> {
        const serverName = message.payload.serverName;
        if (!serverName) {
            await this.sendErrorResponse(message, "serverName is required in the payload.");
            return;
        }

        const mcpClient = McpService.getInstance().getClient(serverName);
        if (!mcpClient) {
            await this.sendErrorResponse(message, `MCP client "${serverName}" not found.`);
            return;
        }

        try {
            const toolsResult = await mcpClient.listTools();
            await this.sendMessage({
                sender: this.name,
                recipient: message.sender,
                type: 'list_mcp_tools_response',
                payload: toolsResult,
                timestamp: new Date().toISOString(),
                correlationId: message.correlationId
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            await this.sendErrorResponse(message, `Failed to list tools from ${serverName}: ${msg}`);
        }
    }

    private async handleCallMcpTool(message: A2AMessage<any>): Promise<void> {
        const payload = message.payload as McpToolCallRequestPayload;
        if (!payload.serverName || !payload.toolName || !payload.args) {
            await this.sendErrorResponse(message, "serverName, toolName, and args are required.");
            return;
        }

        const mcpClient = McpService.getInstance().getClient(payload.serverName);
        if (!mcpClient) {
            await this.sendErrorResponse(message, `MCP client "${payload.serverName}" not found.`);
            return;
        }

        try {
            const toolResult = await mcpClient.callTool({ name: payload.toolName, arguments: payload.args });
            await this.sendMessage({
                sender: this.name,
                recipient: message.sender,
                type: 'call_mcp_tool_response',
                payload: toolResult,
                timestamp: new Date().toISOString(),
                correlationId: message.correlationId
            });
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            await this.sendErrorResponse(message, `Failed to call tool on ${payload.serverName}: ${msg}`);
        }
    }

    private async sendErrorResponse(originalMessage: A2AMessage<any>, errorMessage: string): Promise<void> {
        console.error(`[${this.name}] ${errorMessage}`);
        await this.sendMessage({
            sender: this.name,
            recipient: originalMessage.sender,
            type: 'error',
            payload: { error: errorMessage, originalType: originalMessage.type },
            timestamp: new Date().toISOString(),
            correlationId: originalMessage.correlationId
        });
    }
}
