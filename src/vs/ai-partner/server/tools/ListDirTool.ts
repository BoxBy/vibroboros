import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';

type SortKey = 'name' | 'size' | 'mtime';

const inputSchema = z.object({
  dirPath: z.string().describe('Relative path from a workspace root.'),
  recursive: z.boolean().optional().default(false),
  pattern: z.string().optional().describe('Simple glob-like pattern, e.g., **/*.ts or *.md'),
  ignore: z.array(z.string()).optional().describe('Ignore patterns, same glob-like syntax.'),
  sortBy: z.enum(['name','size','mtime']).optional().default('name'),
  order: z.enum(['asc','desc']).optional().default('asc'),
  start: z.number().int().min(0).optional().default(0),
  limit: z.number().int().min(1).max(2000).optional().default(500),
  roots: z.enum(['primary','all']).optional().default('primary'),
  followSymlinks: z.boolean().optional().default(false)
});

const outputSchema = z.object({
  entries: z.array(z.object({
    name: z.string(),
    path: z.string(),
    type: z.enum(['file','dir']),
    size: z.number().optional(),
    mtimeMs: z.number().optional(),
    rootIndex: z.number().optional()
  }))
});

function globLikeToRegex(pattern: string): RegExp {
  // Very small glob subset: **, *, ?, dot-literals
  // Escape regex meta chars including ']' and '\\' inside the class
  let esc = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  esc = esc.replace(/\*\*/g, '::DOUBLESTAR::');
  esc = esc.replace(/\*/g, '[^/\\]*');
  esc = esc.replace(/::DOUBLESTAR::/g, '([\s\S]*?)');
  esc = esc.replace(/\?/g, '.');
  return new RegExp('^' + esc + '$', 'i');
}

async function listOneRoot(root: string, relDir: string, opts: z.infer<typeof inputSchema>, rootIndex: number) {
  const abs = path.resolve(root, relDir || '.');
  if (!abs.startsWith(root)) { throw new Error('Path escapes workspace.'); }

  const patternRe = opts.pattern ? globLikeToRegex(opts.pattern) : null;
  const ignoreRes = (opts.ignore || []).map(globLikeToRegex);

  const out: any[] = [];
  const seen = new Set<string>();

  const enqueue = async (absPath: string, name: string, isDir: boolean) => {
    const rel = path.relative(root, absPath);
    if (seen.has(rel)) { return; }
    seen.add(rel);
    const stat = await fs.stat(absPath).catch(() => undefined);
    const entry = { name, path: rel, type: isDir ? 'dir' as const : 'file' as const, size: stat?.size, mtimeMs: stat?.mtimeMs, rootIndex };
    const pathForMatch = rel.replace(/\\/g, '/');
    if (pathForMatch.startsWith('.agent') || pathForMatch.includes('/.agent') || pathForMatch.startsWith('.git') || pathForMatch.includes('/.git')) { return; }
    if (patternRe && !patternRe.test(pathForMatch)) { return; }
    if (ignoreRes.some(re => re.test(pathForMatch))) { return; }
    out.push(entry);
  };

  const walk = async (dirAbs: string) => {
    const dirents = await fs.readdir(dirAbs, { withFileTypes: true });
    for (const d of dirents) {
      try {
        const p = path.join(dirAbs, d.name);
        if (d.isSymbolicLink && d.isSymbolicLink()) {
          if (!opts.followSymlinks) { continue; }
          // If following, resolve stat but avoid infinite loops by not recursing symlinked dirs
          const lst = await fs.lstat(p);
          const isDir = lst.isDirectory();
          await enqueue(p, d.name, isDir);
          if (opts.recursive && isDir) {
            // best-effort: do not follow nested symlink dirs to avoid cycles
            continue;
          }
        } else if (d.isDirectory()) {
          // Strict Block
          if (d.name === '.agent' || d.name === '.git') { continue; }

          await enqueue(p, d.name, true);
          if (opts.recursive) { await walk(p); }
        } else {
          await enqueue(p, d.name, false);
        }
      } catch {}
    }
  };

  await walk(abs);
  return out;
}

export function getListDirToolDefinition() {
  return {
    name: 'list_dir',
    description: {
      title: 'List Directory',
      description: 'Lists files and directories under a given path with optional recursion, filters, sorting, and pagination.',
      inputSchema,
      outputSchema,
    },
    handler: async (input: any): Promise<z.infer<typeof outputSchema>> => {
      // Backward compatibility: accept { dirPath } only
      const parsed = inputSchema.safeParse(input?.dirPath ? { dirPath: input.dirPath } : input);
      if (!parsed.success) {
        throw new Error('Invalid input for ListDirTool. Expected { dirPath, recursive?, pattern?, ignore?, sortBy?, order?, start?, limit?, roots?, followSymlinks? }');
      }
      const opts = parsed.data;
      const ws = vscode.workspace.workspaceFolders;
      if (!ws || ws.length === 0) { throw new Error('No workspace folder is open.'); }

      const roots = (opts.roots === 'all') ? ws.map(w => w.uri.fsPath) : [ws[0].uri.fsPath];
      let entries: any[] = [];
      for (let i = 0; i < roots.length; i++) {
        const root = roots[i];
        const items = await listOneRoot(root, opts.dirPath, opts, i);
        entries.push(...items);
      }

      // Sort
      const key: SortKey = (opts.sortBy || 'name');
      const dir = (opts.order || 'asc') === 'asc' ? 1 : -1;
      entries.sort((a, b) => {
        const av = (key === 'name') ? a.path.toLowerCase() : (key === 'size') ? (a.size || 0) : (a.mtimeMs || 0);
        const bv = (key === 'name') ? b.path.toLowerCase() : (key === 'size') ? (b.size || 0) : (b.mtimeMs || 0);
        if (av < bv) { return -1 * dir; }
        if (av > bv) { return 1 * dir; }
        return 0;
      });

      // Pagination
      const start = Math.max(0, opts.start || 0);
      const end = Math.min(entries.length, start + (opts.limit || 500));
      entries = entries.slice(start, end);

      return { entries } as any;
    }
  };
}
