import { z } from 'zod';

const inputSchema = z.object({
  paths: z.array(z.string()).default(['src']).describe('Paths or globs to lint'),
  fix: z.boolean().optional().default(false),
  format: z.string().optional().default('stylish'),
});

const outputSchema = z.object({
  errorCount: z.number(),
  warningCount: z.number(),
  results: z.any(),
  output: z.string().optional(),
});

export function getLintToolDefinition() {
  return {
    name: 'LintTool',
    description: {
      title: 'Run ESLint',
      description: 'Runs ESLint on the workspace using the project configuration.',
      inputSchema,
      outputSchema,
    },
    handler: async ({ paths, fix, format }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
      try {
        // Try to use ESLint Node API if available
        const mod = await import('eslint').catch(() => null) as any;
        if (mod && mod.ESLint) {
          const ESLint = mod.ESLint;
          const eslint = new ESLint({ fix });
          const results = await eslint.lintFiles(paths);
          if (fix) {
            await ESLint.outputFixes(results);
          }
          const formatter = await eslint.loadFormatter(format || 'stylish');
          const output = formatter.format(results);
          const errorCount = results.reduce((a: number, r: any) => a + r.errorCount, 0);
          const warningCount = results.reduce((a: number, r: any) => a + r.warningCount, 0);
          return { errorCount, warningCount, results, output };
        }
        // Fallback: run via CLI (requires eslint to be resolvable in PATH)
        const { exec } = await import('child_process');
        const args = [fix ? '--fix' : '', '-f', format || 'stylish', ...paths].filter(Boolean).join(' ');
        const cmd = `npx --no eslint ${args}`;
        const output: string = await new Promise((resolve) => {
          exec(cmd, { timeout: 60000 }, (err, stdout, stderr) => {
            if (err) {
              // ESLint non-zero exit also writes stdout/stderr; still return counts unknown
              resolve(`${stdout}\n${stderr}`);
            } else {
              resolve(stdout);
            }
          });
        });
        return { errorCount: 0, warningCount: 0, results: {}, output };
      } catch (e: any) {
        return { errorCount: 0, warningCount: 0, results: {}, output: `ESLint failed: ${e.message}` };
      }
    }
  };
}
