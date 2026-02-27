import { z } from 'zod';
import * as os from 'os';
import { exec } from 'child_process';

const inputSchema = z.object({
    command: z.string().describe("The shell command to execute."),
    timeoutMs: z.number().optional().default(20000),
});

const outputSchema = z.object({
    stdout: z.string().describe("STDOUT"),
    stderr: z.string().describe("STDERR"),
    exitCode: z.number().describe("Exit code"),
});

export function getTerminalExecutionToolDefinition() {
    return {
        name: 'run_command',
        description: {
            title: "Execute Terminal Command",
            description: "Executes a shell command in the terminal.",
            inputSchema: inputSchema,
            outputSchema: outputSchema,
        },
        handler: async ({ command, timeoutMs }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
            const forbidden = [/rm\s+-rf\s+\//i, /shutdown/i, /format\s+/i, /mkfs/i, /reg\s+(add|delete)/i, /sudo\s+/i];
            if (forbidden.some(r => r.test(command))) { throw new Error('Forbidden command.'); }
            const shell = os.platform() === 'win32' ? 'powershell.exe' : '/bin/sh';
            // Use specific args for PowerShell to avoid profile loading and interaction
            // Note: We escape double quotes for PowerShell explicitly
            const sanitizedCommand = command.replace(/"/g, '\\"');
            const cmd = os.platform() === 'win32' 
                ? `-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "& { ${sanitizedCommand} }"`
                : ['-c', command];
                
            const execStr = os.platform() === 'win32' 
                ? `${shell} ${cmd}` 
                : `${shell} ${cmd[0]} '${cmd[1].replace(/'/g, "'\\''")}'`;
            return await new Promise((resolve) => {
                exec(execStr, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                    if (error) {
                        const code = (error as any).code ?? 1;
                        resolve({ stdout: stdout?.toString() || '', stderr: stderr?.toString() || String(error), exitCode: code });
                    } else {
                        resolve({ stdout: stdout?.toString() || '', stderr: stderr?.toString() || '', exitCode: 0 });
                    }
                });
            });
        }
    };
}
