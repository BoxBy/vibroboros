import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';

const inputSchema = z.object({
    filePath: z.string().describe("Relative path from workspace root"),
    content: z.string().describe("Content to append"),
    createIfMissing: z.boolean().optional().default(true),
});

const outputSchema = z.object({
    bytesAppended: z.number(),
});

export function getFileAppendToolDefinition() {
    return {
        name: 'FileAppendTool',
        description: {
            title: 'Append File',
            description: 'Appends content to a file within the workspace.',
            inputSchema,
            outputSchema,
        },
        handler: async ({ filePath, content, createIfMissing }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) { throw new Error('No workspace folder is open.'); }
            const root = workspaceFolders[0].uri.fsPath;
            const abs = path.resolve(root, filePath);
            if (!abs.startsWith(root)) { throw new Error('Path escapes workspace.'); }

            try {
                await fs.mkdir(path.dirname(abs), { recursive: true });
                if (createIfMissing) {
                    await fs.appendFile(abs, content, 'utf-8');
                } else {
                    // Ensure exists
                    await fs.access(abs);
                    await fs.appendFile(abs, content, 'utf-8');
                }
                return { bytesAppended: Buffer.byteLength(content, 'utf-8') };
            } catch (e: any) {
                throw new Error(`Append failed: ${e.message}`);
            }
        }
    };
}
