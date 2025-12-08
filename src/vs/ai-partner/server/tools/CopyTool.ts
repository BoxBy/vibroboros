import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';

const inputSchema = z.object({
  from: z.string(),
  to: z.string(),
  overwrite: z.boolean().optional().default(false),
});
const outputSchema = z.object({ copied: z.boolean() });

export function getCopyToolDefinition() {
  return {
    name: 'CopyTool',
    description: {
      title: 'Copy',
      description: 'Copies a file within the workspace.',
      inputSchema,
      outputSchema,
    },
    handler: async ({ from, to, overwrite }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
      const ws = vscode.workspace.workspaceFolders;
      if (!ws) { throw new Error('No workspace folder is open.'); }
      const root = ws[0].uri.fsPath;
      const absFrom = path.resolve(root, from);
      const absTo = path.resolve(root, to);
      if (!absFrom.startsWith(root) || !absTo.startsWith(root)) { throw new Error('Path escapes workspace.'); }
      try {
        try {
          await fs.access(absTo);
          if (!overwrite) { throw new Error('Target exists.'); }
        } catch (e) {
          // ignore ENOENT
        }
        await fs.copyFile(absFrom, absTo);
        return { copied: true };
      } catch (e: any) {
        throw new Error(`Copy failed: ${e.message}`);
      }
    }
  };
}
