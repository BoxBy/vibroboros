import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { z } from 'zod';

const inputSchema = z.object({
    command: z.string().describe("The shell command to execute."),
    cwd: z.string().optional().describe("The working directory to execute the command in. Defaults to the workspace root."),
    timeoutMs: z.number().optional().default(60000).describe("The timeout for the command in milliseconds. Defaults to 60 seconds."),
});

const outputSchema = z.object({
    success: z.boolean(),
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number().nullable(),
});

export function getExecuteShellCommandToolDefinition() {
    return {
        name: 'execute_shell_command',
        description: {
            title: "Execute Shell Command (Blocking)",
            description: "Executes a shell command in the background and waits for it to finish. Returns stdout, stderr, and exit code. Use this for non-interactive tasks like builds, tests, or linting.",
            inputSchema: inputSchema,
            outputSchema: outputSchema,
        },
        handler: async ({ command, cwd, timeoutMs }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
            const workingDir = cwd ? (path.isAbsolute(cwd) ? cwd : path.join(workspaceRoot, cwd)) : workspaceRoot;

            // Security check: simple forbidden patterns
            const forbidden = [/shutdown/i, /format\s+/i, /mkfs/i, /reg\s+(add|delete)/i, /sudo\s+/i];
            if (forbidden.some(r => r.test(command))) { throw new Error('Forbidden command.'); }

            return new Promise<z.infer<typeof outputSchema>>((resolve) => {
                let stdout = '';
                let stderr = '';
                let timedOut = false;

                const child = cp.exec(command, { cwd: workingDir, maxBuffer: 1024 * 1024 * 10 }, (error, stdoutBuffer, stderrBuffer) => {
                    if (timedOut) { return; }

                    const exitCode = error ? error.code : 0;
                    resolve({
                        success: !error,
                        stdout: stdoutBuffer.toString(),
                        stderr: stderrBuffer.toString(),
                        exitCode: typeof exitCode === 'number' ? exitCode : (error ? 1 : 0)
                    });
                });

                if (timeoutMs && timeoutMs > 0) {
                    setTimeout(() => {
                        timedOut = true;
                        child.kill();
                        resolve({
                            success: false,
                            stdout: stdout,
                            stderr: stderr + '\nCommand timed out.',
                            exitCode: -1
                        });
                    }, timeoutMs);
                }
            });
        }
    };
}
