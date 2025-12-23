import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';

const replacementChunkSchema = z.object({
    startLine: z.number().describe("The 1-based start line."),
    endLine: z.number().describe("The 1-based end line."),
    targetContent: z.string().describe("Exact content to verify."),
    replacementContent: z.string().describe("New content."),
});

const inputSchema = z.object({
    filePath: z.string().describe("The relative path to the file."),
    replacementChunks: z.array(replacementChunkSchema).describe("List of replacements. MUST be non-overlapping and sorted by line number descending is recommended to avoid index shifts, but tool will handle internal logic."),
});

const outputSchema = z.object({
    message: z.string(),
});

export function getFileMultiReplaceToolDefinition() {
    return {
        name: 'multi_replace_file_content',
        description: {
            title: "Multi-Replace File Content",
            description: "Replace multiple non-contiguous blocks in a single file.",
            inputSchema: inputSchema,
            outputSchema: outputSchema,
        },
        handler: async ({ filePath, replacementChunks }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
             const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('No workspace folder is open.');
            }
            const roots = workspaceFolders.map(f => path.normalize(f.uri.fsPath));
            const baseRoot = roots[0];
            const candidateAbs = path.normalize(path.isAbsolute(filePath) ? filePath : path.resolve(baseRoot, filePath));

             const matchedRoot = roots.find(root => {
                const rel = path.relative(root, candidateAbs);
                return (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) || rel === '';
            });
            if (!matchedRoot) {
                throw new Error('File path is outside of the allowed workspace directory.');
            }

            try {
                const fileContent = await fs.readFile(candidateAbs, 'utf-8');
                let lines = fileContent.split('\n');

                // Sort chunks by startLine DESCENDING so we don't mess up indices for subsequent edits
                const sortedChunks = [...replacementChunks].sort((a, b) => b.startLine - a.startLine);

                // Validation Pass
                for (let i = 0; i < sortedChunks.length - 1; i++) {
                     if (sortedChunks[i].startLine <= sortedChunks[i+1].endLine) {
                         throw new Error("Overlapping replacement chunks detected. Chunks must be distinct.");
                     }
                }

                for (const chunk of sortedChunks) {
                    const { startLine, endLine, targetContent, replacementContent } = chunk;

                    if (startLine < 1 || endLine > lines.length || startLine > endLine) {
                         throw new Error(`Invalid line range: ${startLine}-${endLine}`);
                    }

                    const targetLines = lines.slice(startLine - 1, endLine);
                    const actualTarget = targetLines.join('\n');

                    if (actualTarget.replace(/\r/g, '') !== targetContent.replace(/\r/g, '')) {
                         throw new Error(`Target content mismatch at lines ${startLine}-${endLine}. \nExpected:\n${targetContent.substring(0, 100)}...\nActual:\n${actualTarget.substring(0, 100)}...`);
                    }

                    const before = lines.slice(0, startLine - 1);
                    const after = lines.slice(endLine);
                    const newLines = replacementContent.split('\n');
                    lines = [...before, ...newLines, ...after];
                }

                const finalContent = lines.join('\n');
                await fs.writeFile(candidateAbs, finalContent, 'utf-8');

                // Semantic Update
                try {
                    const { SemanticModelService } = require('../../services/SemanticModelService');
                    if (SemanticModelService) {
                        SemanticModelService.getInstance().updateFile(candidateAbs);
                    }
                } catch {}

                return { message: `Successfully applied ${replacementChunks.length} replacements in ${filePath}.` };

            } catch (error: any) {
                if (error.code === 'ENOENT') {
                    throw new Error(`File not found: ${filePath}`);
                }
                throw error;
            }
        }
    };
}
