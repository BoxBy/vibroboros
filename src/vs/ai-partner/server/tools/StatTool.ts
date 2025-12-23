import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';

const inputSchema = z.object({
  targetPath: z.string().describe('Relative path from workspace root'),
});

const outputSchema = z.object({
  exists: z.boolean(),
  isFile: z.boolean().optional(),
  isDir: z.boolean().optional(),
  size: z.number().optional(),
  mtimeMs: z.number().optional(),
  ctimeMs: z.number().optional(),
});

export function getStatToolDefinition() {
  return {
    name: 'get_file_info',
    description: {
      title: 'File/Directory Stat',
      description: 'Returns existence and metadata for a file or directory within the workspace.',
      inputSchema,
      outputSchema,
    },
    handler: async ({ targetPath }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
      const ws = vscode.workspace.workspaceFolders;
      if (!ws) { throw new Error('No workspace folder is open.'); }
      const root = ws[0].uri.fsPath;
      const abs = path.resolve(root, targetPath);
      if (!abs.startsWith(root)) { throw new Error('Path escapes workspace.'); }
      try {
        const st = await fs.stat(abs);
        return {
          exists: true,
          isFile: st.isFile(),
          isDir: st.isDirectory(),
          size: st.size,
          mtimeMs: st.mtimeMs,
          ctimeMs: st.ctimeMs,
        };
      } catch (e: any) {
        if (e?.code === 'ENOENT') {
          return { exists: false } as any;
        }
        throw new Error(`Stat failed: ${e.message}`);
      }
    }
  };
}
