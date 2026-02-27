import { z } from 'zod';
import { FileOperationService } from './FileOperationService';

const inputSchema = z.object({
  filePath: z.string().describe('Relative path from workspace root'),
});

const outputSchema = z.object({ deleted: z.boolean() });

export function getFileDeleteToolDefinition() {
  return {
    name: 'FileDeleteTool',
    description: {
      title: 'Delete File',
      description: 'Deletes a file within the workspace (non-recursive).',
      inputSchema,
      outputSchema,
    },
    handler: async ({ filePath }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
      const service = FileOperationService.getInstance();
      const result = await service.deleteFile(filePath);

      if (!result.success) {
        if (result.error?.includes('not found')) {
          return { deleted: false };
        }
        throw new Error(result.error || 'Failed to delete file');
      }

      return { deleted: true };
    }
  };
}
