import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { McpServer } from '@modelcontextprotocol/sdk';
import { z } from 'zod';

export function registerMemoryTool(server: McpServer) {
    server.registerTool(
        'MemoryTool',
        {
            title: "Save Fact to Memory",
            description: "Saves a specific fact, user preference, or correction to a long-term memory file to be referenced in future interactions. Use this when the user corrects you or states a clear preference.",
            inputSchema: z.object({
                fact: z.string().describe("A single, concise fact to remember for future interactions. This should be a complete sentence."),
            }),
            outputSchema: z.object({
                message: z.string().describe("A confirmation message."),
            }),
        },
        async ({ fact }) => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folder is open to save the memory.');
            }
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const memoryPath = path.resolve(workspaceRoot, '.agent', 'memory.json');

            try {
                let memories: string[] = [];
                try {
                    const memoryJson = await fs.readFile(memoryPath, 'utf-8');
                    memories = JSON.parse(memoryJson);
                } catch (e) {
                    // File might not exist yet, which is fine.
                }
                
                memories.push(fact);
                
                await fs.writeFile(memoryPath, JSON.stringify(memories, null, 4));
                const message = `Successfully remembered: ${fact}`;
                return { message };
            } catch (error: any) {
                throw new Error(`Failed to save memory. Error: ${error.message}`);
            }
        }
    );
}
