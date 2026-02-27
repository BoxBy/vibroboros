import { z } from 'zod';
import { FileOperationService } from './FileOperationService';

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
            const service = FileOperationService.getInstance();
            const result = await service.multiReplaceFileContent(filePath, replacementChunks);

            if (!result.success) {
                throw new Error(result.error || 'Failed to replace file content');
            }

            return { message: result.message };
        }
    };
}
