import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';

const inputSchema = z.object({
  from: z.string(),
  to: z.string(),
  overwrite: z.boolean().optional().default(false),
});
const outputSchema = z.object({ moved: z.boolean() });

export function getMoveToolDefinition() {
  return {
    name: 'MoveTool',
    description: {
      title: 'Move',
      description: 'Moves/renames a file within the workspace.',
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
        if (!overwrite) {
          try { await fs.access(absTo); throw new Error('Target exists. Set overwrite to true.'); } catch {}
        }
        await fs.rename(absFrom, absTo);
        return { moved: true };
      } catch (e: any) {
        throw new Error(`Move failed: ${e.message}`);
      }
    }
  };
}
