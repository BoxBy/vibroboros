import { MCPMessage } from '../interfaces/MCPMessage';
import { WebSearchTool } from './tools/WebSearchTool';
import { TerminalExecutionTool } from './tools/TerminalExecutionTool';
import { GitAutomationTool } from './tools/GitAutomationTool';
import { FileReadTool } from './tools/FileReadTool';
import { FileWriteTool } from './tools/FileWriteTool';
import { SecurityVulnerabilityTool } from './tools/SecurityVulnerabilityTool';
import { TaskCompletionTool } from '../tools/TaskCompletionTool';

/**
 * @class MCPServer
 * @description Represents the server-side component of the Master Control Program (MCP).
 * This server is responsible for managing a suite of *internal* tools that the AI can execute directly within the extension.
 * It receives JSON-RPC 2.0 messages from the OrchestratorAgent, validates them, calls the appropriate tool,
 * and returns a structured response. This provides a secure and structured way for the LLM to interact with the local environment.
 */
export class MCPServer {
    private tools: Map<string, any>;

    /**
     * Creates an instance of MCPServer.
     */
    constructor() {
        this.tools = new Map();
        this.registerTools();
    }

    /**
     * Initializes and registers all available tools that the server can execute.
     * @private
     */
    private registerTools(): void {
        this.tools.set('WebSearchTool', new WebSearchTool());
        this.tools.set('TerminalExecutionTool', new TerminalExecutionTool());
        this.tools.set('GitAutomationTool', new GitAutomationTool());
        this.tools.set('FileReadTool', new FileReadTool());
        this.tools.set('FileWriteTool', new FileWriteTool());
        this.tools.set('SecurityVulnerabilityTool', new SecurityVulnerabilityTool()); // Register the new security tool
        this.tools.set('TaskCompletionTool', new TaskCompletionTool());
        console.log('[MCPServer] Registered tools:', Array.from(this.tools.keys()));
    }

    /**
     * Returns the JSON schemas for all registered tools.
     * This is used to inform the LLM about available capabilities in a format it can understand.
     * @returns {any[]} An array of tool schemas compatible with OpenAI's tool format.
     */
    public getToolSchemas(): any[] {
        return Array.from(this.tools.values()).map(tool => tool.getSchema());
    }

    /**
     * Handles an incoming JSON-RPC request from the client (e.g., OrchestratorAgent).
     * It validates the request, finds the specified tool, executes it with the given arguments,
     * and returns a JSON-RPC response.
     * @param {MCPMessage<any>} request The MCP message (JSON-RPC request) to process.
     * @returns {Promise<any>} A promise that resolves to a JSON-RPC 2.0 response object.
     */
    public async handleRequest(request: MCPMessage<any>): Promise<any> {
        console.log('[MCPServer] Received request:', request);

        if (!request.method || request.method !== 'tools/call') {
            return this.createErrorResponse(request.id, -32601, `Method '${request.method}' not found.`);
        }

        if (!request.params) {
            return this.createErrorResponse(request.id, -32602, 'Invalid params: The params object is missing.');
        }

        const toolName = request.params.name;
        const tool = this.tools.get(toolName);

        if (!tool) {
            return this.createErrorResponse(request.id, -32601, `Tool '${toolName}' not found.`);
        }

        try {
            const content = await tool.execute(request.params.arguments);
            return this.createSuccessResponse(request.id, { content });
        } catch (error: any) {
            return this.createErrorResponse(request.id, -32602, error.message || 'Invalid parameters.');
        }
    }

    /**
     * Creates a standard JSON-RPC 2.0 success response object.
     * @param {string | number | null} id The ID from the original request.
     * @param {any} result The payload of the successful response.
     * @returns {any} The formatted success response object.
     * @private
     */
    private createSuccessResponse(id: string | number | null, result: any): any {
        return {
            jsonrpc: '2.0',
            id,
            result
        };
    }

    /**
     * Creates a standard JSON-RPC 2.0 error response object.
     * @param {string | number | null} id The ID from the original request.
     * @param {number} code The JSON-RPC error code.
     * @param {string} message A descriptive error message.
     * @returns {any} The formatted error response object.
     * @private
     */
    private createErrorResponse(id: string | number | null, code: number, message: string): any {
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