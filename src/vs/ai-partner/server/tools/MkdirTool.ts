import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';

const inputSchema = z.object({
  dirPath: z.string().describe('Relative directory path from workspace root'),
  recursive: z.boolean().optional().default(true),
});

const outputSchema = z.object({ created: z.boolean() });

export function getMkdirToolDefinition() {
  return {
    name: 'MkdirTool',
    description: {
      title: 'Make Directory',
      description: 'Creates a directory inside the workspace.',
      inputSchema,
      outputSchema,
    },
    handler: async ({ dirPath, recursive }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
      const ws = vscode.workspace.workspaceFolders;
      if (!ws) { throw new Error('No workspace folder is open.'); }
      const root = ws[0].uri.fsPath;
      const abs = path.resolve(root, dirPath);
      if (!abs.startsWith(root)) { throw new Error('Path escapes workspace.'); }
      try {
        await fs.mkdir(abs, { recursive });
        return { created: true };
      } catch (e: any) {
        throw new Error(`Mkdir failed: ${e.message}`);
      }
    }
  };
}
