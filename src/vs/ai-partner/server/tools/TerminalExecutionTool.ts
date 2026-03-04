import { z } from 'zod';
import * as os from 'os';
import { spawn } from 'child_process';
import { Server } from '@modelcontextprotocol/sdk/server';

const inputSchema = z.object({
    command: z.string().describe("The shell command to execute."),
    timeoutMs: z.number().optional().default(20000),
});

const outputSchema = z.object({
    stdout: z.string().describe("STDOUT"),
    stderr: z.string().describe("STDERR"),
    exitCode: z.number().describe("Exit code"),
});

export function getTerminalExecutionToolDefinition(server?: Server) {
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
            const args = os.platform() === 'win32' 
                ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `& { ${sanitizedCommand} }`]
                : ['-c', command];
                
            return await new Promise((resolve) => {
                let stdoutData = '';
                let stderrData = '';
                
                const proc = spawn(shell, args);
                
                let isComplete = false;
                const timeoutTimer = setTimeout(() => {
                    if (!isComplete) {
                        proc.kill();
                    }
                }, timeoutMs);

                proc.stdout.on('data', (data) => {
                    const text = data.toString();
                    stdoutData += text;
                    if (server) {
                        try {
                            server.notification({ method: 'notifications/terminal/stream', params: { text, command } });
                        } catch (e) {}
                    }
                });

                proc.stderr.on('data', (data) => {
                    const text = data.toString();
                    stderrData += text;
                    if (server) {
                        try {
                            server.notification({ method: 'notifications/terminal/stream', params: { text, command } });
                        } catch (e) {}
                    }
                });

                proc.on('close', (code) => {
                    isComplete = true;
                    clearTimeout(timeoutTimer);
                    resolve({ stdout: stdoutData, stderr: stderrData, exitCode: code ?? 1 });
                });
                
                proc.on('error', (error) => {
                    isComplete = true;
                    clearTimeout(timeoutTimer);
                    resolve({ stdout: stdoutData, stderr: stderrData + String(error), exitCode: 1 });
                });
            });
        }
    };
}
