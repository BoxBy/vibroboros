import { MCPMessage, MCPResponsePayload } from '../interfaces/MCPMessage';
import { WebSearchTool } from './tools/WebSearchTool';
import { TerminalExecutionTool } from './tools/TerminalExecutionTool';
import { GitAutomationTool } from './tools/GitAutomationTool';

/**
 * @class MCPServer
 * The local server that listens for MCP messages from the VSCode extension,
 * executes the requested tool, and returns the result according to the JSON-RPC 2.0 spec.
 */
export class MCPServer {
    private tools: Map<string, any>;

    constructor() {
        this.tools = new Map();
        this.registerTools();
    }

    private registerTools(): void {
        this.tools.set('WebSearchTool', new WebSearchTool());
        this.tools.set('TerminalExecutionTool', new TerminalExecutionTool());
        this.tools.set('GitAutomationTool', new GitAutomationTool());
        console.log('[MCPServer] Registered tools:', Array.from(this.tools.keys()));
    }

    /**
     * Handles an incoming JSON-RPC request from the client.
     * @param request The MCP message (JSON-RPC request) to process.
     */
    public async handleRequest(request: MCPMessage<any>): Promise<any> {
        console.log('[MCPServer] Received request:', request);

        if (request.method !== 'tools/call') {
            return this.createErrorResponse(request.id, -32601, `Method '${request.method}' not found.`);
        }

        const toolName = request.params.name;
        const tool = this.tools.get(toolName);

        if (!tool) {
            return this.createErrorResponse(request.id, -32601, `Tool '${toolName}' not found.`);
        }

        try {
            // The `execute` method in tools should return the `content` part of the result.
            const content = await tool.execute(request.params.arguments);
            return this.createSuccessResponse(request.id, { content });
        } catch (error: any) {
            // Assuming tool errors are for invalid parameters.
            return this.createErrorResponse(request.id, -32602, error.message || 'Invalid parameters.');
        }
    }

    private createSuccessResponse(id: string | number, result: any): any {
        return {
            jsonrpc: '2.0',
            id,
            result
        };
    }

    private createErrorResponse(id: string | number, code: number, message: string): any {
        return {
            jsonrpc: '2.0',
            id,
            error: {
                code,
                message
            }
        };
    }
}
