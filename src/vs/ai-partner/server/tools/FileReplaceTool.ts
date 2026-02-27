import { z } from 'zod';
import { FileOperationService } from './FileOperationService';

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
            const service = FileOperationService.getInstance();
            const result = await service.replaceFileContent(
                filePath,
                startLine,
                endLine,
                targetContent,
                replacementContent
            );

            if (!result.success) {
                throw new Error(result.error || 'Failed to replace file content');
            }

            return { message: result.message };
        }
    };
}
