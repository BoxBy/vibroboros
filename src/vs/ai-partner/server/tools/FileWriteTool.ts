import { z } from 'zod';
import { FileOperationService } from './FileOperationService';

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
            const service = FileOperationService.getInstance();
            const result = await service.writeFile(filePath, content);

            if (!result.success) {
                throw new Error(result.error || 'Failed to write file');
            }

            return { message: result.message };
        }
    };
}
