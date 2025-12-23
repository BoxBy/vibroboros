import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';

const inputSchema = z.object({
    filePath: z.string().describe("The relative path for the file from the workspace root (e.g., 'src/new-feature.ts')."),
    content: z.string().describe("The full content to be written to the file."),
});

const outputSchema = z.object({
    message: z.string().describe("A confirmation message."),
});

export function getFileWriteToolDefinition() {
    return {
        name: 'write_to_file',
        description: {
            title: "Write File",
            description: "Writes or overwrites a file with the specified content within the project workspace. Use this tool when the user wants to create or save a file, especially when there is code in the conversation history that needs to be saved. Extract the code from previous messages and save it with an appropriate filename based on the code context (e.g., Python BFS code -> 'bfs.py', JavaScript function -> 'function.js').",
            inputSchema: inputSchema,
            outputSchema: outputSchema,
        },
        handler: async ({ filePath, content }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
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
                return (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) || rel === '';
            });
            if (!matchedRoot) {
                throw new Error('File path is outside of the allowed workspace directory.');
            }

            try {
                await fs.mkdir(path.dirname(candidateAbs), { recursive: true });
                await fs.writeFile(candidateAbs, content, 'utf-8');
                
                // Trigger Semantic Graph Update (Centralized for all agents)
                try {
                    const { SemanticModelService } = require('../../services/SemanticModelService');
                    if (SemanticModelService) {
                        SemanticModelService.getInstance().updateFile(candidateAbs);
                    }
                } catch {}

                const relForMsg = path.relative(matchedRoot, candidateAbs) || candidateAbs;
                const message = `Successfully wrote content to ${relForMsg}`;
                return { message };
            } catch (error: any) {
                throw new Error(`Failed to write file at path: ${filePath}. Error: ${error.message}`);
            }
        }
    };
}
