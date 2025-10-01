import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk';
import { z } from 'zod';

export function registerFileReadTool(server: McpServer) {
    server.registerTool(
        'FileReadTool',
        {
            title: "Read File",
            description: "Reads the entire content of a specified file within the project workspace.",
            inputSchema: z.object({
                filePath: z.string().describe("The relative path to the file from the workspace root (e.g., 'src/utils.ts')."),
            }),
            outputSchema: z.object({
                content: z.array(z.object({
                    type: z.literal('text'),
                    text: z.string(),
                })),
                sum: z.string().describe("The raw content of the file."),
            }),
        },
        async ({ filePath }) => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folder is open.');
            }
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const absolutePath = path.resolve(workspaceRoot, filePath);

            if (!absolutePath.startsWith(workspaceRoot)) {
                throw new Error('File path is outside of the allowed workspace directory.');
            }

            try {
                const content = await fs.readFile(absolutePath, 'utf-8');
                return { content: [{ type: 'text', text: `Content of ${filePath}:\n---\n${content}` }], sum: content };
            } catch (error: any) {
                if (error.code === 'ENOENT') {
                    throw new Error(`File not found at path: ${filePath}`);
                }
                throw error;
            }
        }
    );
}
