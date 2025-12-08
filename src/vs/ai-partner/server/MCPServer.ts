import { Server } from '@modelcontextprotocol/sdk/server';
import { z, ZodSchema } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getFileReadToolDefinition } from './tools/FileReadTool';
import { getFileWriteToolDefinition } from './tools/FileWriteTool';
import { getTerminalExecutionToolDefinition } from './tools/TerminalExecutionTool';
import { getWebSearchToolDefinition } from './tools/WebSearchTool';
import { getGitAutomationToolDefinition } from './tools/GitAutomationTool';
import { getSecurityVulnerabilityToolDefinition } from './tools/SecurityVulnerabilityTool';
import { getTaskCompletionToolDefinition } from '../tools/TaskCompletionTool';
import { getMemoryToolDefinition } from './tools/MemoryTool';
import { getGitignoreToolDefinition } from './tools/GitignoreTool';
import { ToolsCallRequestSchema, ToolsListRequestSchema } from '../schemas/ToolsSchema';
import { getFileAppendToolDefinition } from './tools/FileAppendTool';
import { getFileDeleteToolDefinition } from './tools/FileDeleteTool';
import { getMkdirToolDefinition } from './tools/MkdirTool';
import { getMoveToolDefinition } from './tools/MoveTool';
import { getCopyToolDefinition } from './tools/CopyTool';
import { getListDirToolDefinition } from './tools/ListDirTool';
import { getStatToolDefinition } from './tools/StatTool';
import { getLintToolDefinition } from './tools/LintTool';
import { getBrowserOpenToolDefinition } from './tools/BrowserOpenTool';

// Define a generic interface for a tool definition
export interface ToolDefinition<TInput extends ZodSchema, TOutput extends ZodSchema> {
    name: string;
    description: {
        title: string;
        description: string;
        inputSchema: TInput;
        outputSchema: TOutput;
    };
    handler: (input: z.infer<TInput>) => Promise<z.infer<TOutput>>;
}

export function createMCPServer(): Server {
    const server = new Server({
        name: 'ViperMCPServer',
        version: '1.0.0',
        description: 'A server for AI agent tools.',
    }, {
        capabilities: {
            tools: {
                listChanged: true,
            },
        },
    });

    const toolRegistry = new Map<string, ToolDefinition<any, any>>();

    // Register all tools
    const toolDefinitions = [
        getFileReadToolDefinition(),
        getFileWriteToolDefinition(),
        getFileAppendToolDefinition(),
        getFileDeleteToolDefinition(),
        getMkdirToolDefinition(),
        getMoveToolDefinition(),
        getCopyToolDefinition(),
        getListDirToolDefinition(),
        getStatToolDefinition(),
        getTerminalExecutionToolDefinition(),
        getWebSearchToolDefinition(),
        getGitAutomationToolDefinition(),
        getSecurityVulnerabilityToolDefinition(),
        getTaskCompletionToolDefinition(),
        getMemoryToolDefinition(),
        getGitignoreToolDefinition(),
        getLintToolDefinition(),
        getBrowserOpenToolDefinition(),
    ];

    for (const tool of toolDefinitions) {
        toolRegistry.set(tool.name, tool);
    }

    // Handler for listing tools
    server.setRequestHandler(ToolsListRequestSchema, async (_request) => {
        const toJsonSchema = (schema: ZodSchema | undefined) => {
            if (!schema) { return undefined as any; }
            try {
                // MCP SDK Standard: Convert Zod schema to JSON Schema using zod-to-json-schema
                return zodToJsonSchema(schema, { target: 'openApi3' });
            } catch (e: any) {
                console.warn(`[MCPServer] Failed to convert Zod schema to JSON Schema:`, e?.message || e);
                // Fallback: minimal schema
                return {
                    type: 'object',
                    properties: {},
                    required: [] as string[],
                } as any;
            }
        };

        const toolSchemas = Array.from(toolRegistry.values()).map(tool => ({
            name: tool.name,
            title: tool.description.title,
            description: tool.description.description,
            inputSchema: toJsonSchema(tool.description.inputSchema),
            outputSchema: toJsonSchema(tool.description.outputSchema),
        }));
        return { tools: toolSchemas } as any;
    });

    // Handler for calling a tool
    server.setRequestHandler(ToolsCallRequestSchema, async (request) => {
        const { name, arguments: args } = (request as any).params || {};
        const toolName = name as string;
        const parameters = (args ?? {}) as any;
        const tool = toolRegistry.get(toolName);

        if (!tool) {
            throw new Error(`Tool "${toolName}" not found.`);
        }

        const payload = await tool.handler(parameters);
        // Return MCP-compatible CallToolResult
        const text = typeof payload === 'string' ? payload
            : (typeof payload?.content === 'string' ? payload.content
            : JSON.stringify(payload));
        return {
            content: [{ type: 'text', text }],
            structuredContent: payload
        } as any;
    });

    return server;
}
