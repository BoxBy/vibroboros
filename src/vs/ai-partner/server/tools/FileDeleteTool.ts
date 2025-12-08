import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';

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
      const ws = vscode.workspace.workspaceFolders;
      if (!ws) { throw new Error('No workspace folder is open.'); }
      const root = ws[0].uri.fsPath;
      const abs = path.resolve(root, filePath);
      if (!abs.startsWith(root)) { throw new Error('Path escapes workspace.'); }
      try {
        await fs.unlink(abs);
        return { deleted: true };
      } catch (e: any) {
        if (e.code === 'ENOENT') { return { deleted: false }; }
        throw new Error(`Delete failed: ${e.message}`);
      }
    }
  };
}
