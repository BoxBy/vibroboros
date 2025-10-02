import { McpServer } from '@modelcontextprotocol/sdk';
import { registerFileReadTool } from './tools/FileReadTool';
import { registerFileWriteTool } from './tools/FileWriteTool';
import { registerTerminalExecutionTool } from './tools/TerminalExecutionTool';
import { registerWebSearchTool } from './tools/WebSearchTool';
import { registerGitAutomationTool } from './tools/GitAutomationTool';
import { registerSecurityVulnerabilityTool } from './tools/SecurityVulnerabilityTool';
import { registerTaskCompletionTool } from '../tools/TaskCompletionTool';
import { registerMemoryTool } from './tools/MemoryTool';
import { registerGitignoreTool } from './tools/GitignoreTool';

export function createMCPServer(): McpServer {
    const server = new McpServer({
        name: 'VibroborosMCPServer',
        description: 'A server for AI agent tools.',
    });

    registerFileReadTool(server);
    registerFileWriteTool(server);
    registerTerminalExecutionTool(server);
    registerWebSearchTool(server);
    registerGitAutomationTool(server);
    registerSecurityVulnerabilityTool(server);
    registerTaskCompletionTool(server);
    registerMemoryTool(server);
    registerGitignoreTool(server);

    return server;
}