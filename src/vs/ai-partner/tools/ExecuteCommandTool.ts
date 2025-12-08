import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

export interface ExecuteCommandOptions {
    command: string;
    cwd?: string;
    timeout?: number;
}

export interface ExecuteCommandResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
}

export class ExecuteCommandTool {
    private static readonly DEFAULT_TIMEOUT = 60000; // 60 seconds

    public static getToolDefinition() {
        return {
            name: 'execute_command',
            description: 'Execute a shell command in the terminal. Use this to run tests, builds, or other shell commands.',
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'The command to execute.'
                    },
                    cwd: {
                        type: 'string',
                        description: 'The working directory to execute the command in. Defaults to the workspace root.'
                    }
                },
                required: ['command']
            }
        };
    }

    public async execute(options: ExecuteCommandOptions): Promise<ExecuteCommandResult> {
        const { command, cwd, timeout = ExecuteCommandTool.DEFAULT_TIMEOUT } = options;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
        const workingDir = cwd ? (path.isAbsolute(cwd) ? cwd : path.join(workspaceRoot, cwd)) : workspaceRoot;

        return new Promise<ExecuteCommandResult>((resolve) => {
            let stdout = '';
            let stderr = '';
            let timedOut = false;

            const child = cp.exec(command, { cwd: workingDir, maxBuffer: 1024 * 1024 * 10 }, (error, stdoutBuffer, stderrBuffer) => {
                if (timedOut) return;

                const exitCode = error ? error.code : 0;
                resolve({
                    success: !error,
                    stdout: stdoutBuffer.toString(),
                    stderr: stderrBuffer.toString(),
                    exitCode: typeof exitCode === 'number' ? exitCode : (error ? 1 : 0)
                });
            });

            if (timeout > 0) {
                setTimeout(() => {
                    timedOut = true;
                    child.kill();
                    resolve({
                        success: false,
                        stdout,
                        stderr: stderr + '\nCommand timed out.',
                        exitCode: -1
                    });
                }, timeout);
            }
        });
    }
}
