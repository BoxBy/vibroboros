
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk';
import { z } from 'zod';

export function registerFileWriteTool(server: McpServer) {
    server.registerTool(
        'FileWriteTool',
        {
            title: "Write File",
            description: "Writes or overwrites a file with the specified content within the project workspace.",
            inputSchema: z.object({
                filePath: z.string().describe("The relative path for the file from the workspace root (e.g., 'src/new-feature.ts')."),
                content: z.string().describe("The full content to be written to the file."),
            }),
            outputSchema: z.object({
                message: z.string().describe("A confirmation message."),
            }),
        },
        async ({ filePath, content }) => {
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
                await fs.mkdir(path.dirname(absolutePath), { recursive: true });
                await fs.writeFile(absolutePath, content, 'utf-8');
                const message = `Successfully wrote content to ${filePath}`;
                return { message };
            } catch (error: any) {
                throw new Error(`Failed to write file at path: ${filePath}. Error: ${error.message}`);
            }
        }
    );
}
