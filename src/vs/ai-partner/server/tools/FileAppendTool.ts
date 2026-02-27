import { z } from 'zod';
import { FileOperationService } from './FileOperationService';

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
            const service = FileOperationService.getInstance();
            const result = await service.appendFile(filePath, content, {
                createDirectories: true,
                updateSemanticGraph: true
            });

            if (!result.success) {
                throw new Error(result.error || 'Failed to append file');
            }

            return { bytesAppended: Buffer.byteLength(content, 'utf-8') };
        }
    };
}
