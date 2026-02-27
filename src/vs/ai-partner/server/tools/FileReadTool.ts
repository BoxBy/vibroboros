import { z } from 'zod';
import { FileOperationService } from './FileOperationService';

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
            const service = FileOperationService.getInstance();
            const result = await service.readFile(filePath, { startLine, endLine });

            if (!result.success) {
                throw new Error(result.error || 'Failed to read file');
            }

            return { content: result.data.content };
        }
    };
}

