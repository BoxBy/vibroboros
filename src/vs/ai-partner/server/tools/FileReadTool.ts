import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';

const inputSchema = z.object({
    filePath: z.string().describe("The relative path to the file from the workspace root (e.g., 'src/utils.ts')."),
    startLine: z.number().optional().describe("The 1-based start line number to read from."),
    endLine: z.number().optional().describe("The 1-based end line number to read up to (inclusive)."),
});

const outputSchema = z.object({
    content: z.string().describe("The content of the file (or partial content)."),
});

export function getFileReadToolDefinition() {
    return {
        name: 'read_file',
        description: {
            title: "Read File",
            description: "Reads the content of a specified file within the project workspace. Supports reading specific line ranges.",
            inputSchema: inputSchema,
            outputSchema: outputSchema,
        },
        handler: async ({ filePath, startLine, endLine }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('No workspace folder is open.');
            }
            const roots = workspaceFolders.map(f => path.normalize(f.uri.fsPath));
            const baseRoot = roots[0];
            const candidateAbs = path.normalize(path.isAbsolute(filePath) ? filePath : path.resolve(baseRoot, filePath));

            // Allow only if inside ANY workspace root
            const matchedRoot = roots.find(root => {
                const rel = path.relative(root, candidateAbs);
                return rel && !rel.startsWith('..') && !path.isAbsolute(rel) || rel === '';
            });
            if (!matchedRoot) {
                throw new Error('File path is outside of the allowed workspace directory.');
            }

            try {
                const content = await fs.readFile(candidateAbs, 'utf-8');
                
                if (startLine !== undefined || endLine !== undefined) {
                    const lines = content.split('\n');
                    const start = (startLine !== undefined && startLine > 0) ? startLine - 1 : 0;
                    const end = (endLine !== undefined && endLine > 0) ? endLine : lines.length;
                    
                    // Validate range
                    if (start >= lines.length) {
                         return { content: '' };
                    }
                    
                    const sliced = lines.slice(start, end);
                    return { content: sliced.join('\n') };
                }

                return { content };
            } catch (error: any) {
                if (error.code === 'ENOENT') {
                    throw new Error(`File not found at path: ${filePath}`);
                }
                throw error;
            }
        }
    };
}

