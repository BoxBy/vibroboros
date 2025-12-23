import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';

const inputSchema = z.object({
    filePath: z.string().describe("The relative path to the file from the workspace root."),
    startLine: z.number().describe("The 1-based start line number of the content to replace."),
    endLine: z.number().describe("The 1-based end line number of the content to replace (inclusive)."),
    targetContent: z.string().describe("The exact content to be replaced (for verification)."),
    replacementContent: z.string().describe("The new content to insert in place of the target content."),
});

const outputSchema = z.object({
    message: z.string().describe("Success message."),
    diff: z.string().optional().describe("Unified diff of the change."),
});

export function getFileReplaceToolDefinition() {
    return {
        name: 'replace_file_content',
        description: {
            title: "Replace File Content",
            description: "Replace a specific range of lines in a file with new content. STRICTLY requires exact line numbers and target content verification.",
            inputSchema: inputSchema,
            outputSchema: outputSchema,
        },
        handler: async ({ filePath, startLine, endLine, targetContent, replacementContent }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('No workspace folder is open.');
            }
            const roots = workspaceFolders.map(f => path.normalize(f.uri.fsPath));
            const baseRoot = roots[0];
            const candidateAbs = path.normalize(path.isAbsolute(filePath) ? filePath : path.resolve(baseRoot, filePath));

            // Security Check
            const matchedRoot = roots.find(root => {
                const rel = path.relative(root, candidateAbs);
                return (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) || rel === '';
            });
            if (!matchedRoot) {
                throw new Error('File path is outside of the allowed workspace directory.');
            }

            try {
                // Read File
                const fileContent = await fs.readFile(candidateAbs, 'utf-8');
                const lines = fileContent.split('\n');

                // Validate Range
                if (startLine < 1 || endLine > lines.length || startLine > endLine) {
                    throw new Error(`Invalid line range: ${startLine}-${endLine}. File has ${lines.length} lines.`);
                }

                // Extract Target & Verify (Loose check for whitespace might be needed, but strict for now)
                const targetLines = lines.slice(startLine - 1, endLine);
                const actualTarget = targetLines.join('\n');
                
                // Normalization for comparison (ignore CR)
                if (actualTarget.replace(/\r/g, '') !== targetContent.replace(/\r/g, '')) {
                     // Advanced fuzzy match/error could go here. For now, strict error.
                     // Often LLMs mess up whitespace. We can maybe be lenient if trimmed matches?
                     // Let's trust the LLM to get it right if it read the file recently.
                     // But if it fails, throw error with ACTUAL content so LLM can correct.
                     throw new Error(`Target content mismatch. \nExpected:\n${targetContent}\nActual:\n${actualTarget}`);
                }

                // Perform Replacement
                // Note: replacementContent might have newlines.
                const before = lines.slice(0, startLine - 1);
                const after = lines.slice(endLine);
                const newLines = replacementContent.split('\n');
                
                const finalLines = [...before, ...newLines, ...after];
                const finalContent = finalLines.join('\n');

                await fs.writeFile(candidateAbs, finalContent, 'utf-8');

                // Semantic Update
                try {
                    const { SemanticModelService } = require('../../services/SemanticModelService');
                    if (SemanticModelService) {
                        SemanticModelService.getInstance().updateFile(candidateAbs);
                    }
                } catch {}

                return { 
                    message: `Successfully replaced lines ${startLine}-${endLine} in ${filePath}.`,
                };

            } catch (error: any) {
                 if (error.code === 'ENOENT') {
                    throw new Error(`File not found: ${filePath}`);
                }
                throw error;
            }
        }
    };
}
