import * as vscode from 'vscode';
import { exec, ExecOptions } from 'child_process';
import { McpServer } from '@modelcontextprotocol/sdk';
import { z } from 'zod';

export function registerTerminalExecutionTool(server: McpServer) {
    server.registerTool(
        'TerminalExecutionTool',
        {
            title: "Execute Terminal Command",
            description: "Executes a shell command in the terminal. The command runs in the root of the current workspace unless `cwd` is specified.",
            inputSchema: z.object({
                command: z.string().describe("The shell command to execute."),
                cwd: z.string().optional().describe("The working directory to run the command in. Defaults to the workspace root."),
            }),
            outputSchema: z.object({
                output: z.string().describe("The output of the command, including stdout, stderr, and any errors."),
            }),
        },
        async ({ command, cwd }) => {
            const defaultCwd = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
            const options: ExecOptions = {
                cwd: cwd || defaultCwd,
            };

            if (!options.cwd) {
                throw new Error('Could not determine a working directory. Please open a folder or specify a `cwd`.');
            }

            return new Promise((resolve, reject) => {
                exec(command, options, (error, stdout, stderr) => {
                    let output = `> Executed in: ${options.cwd}\n> Command: ${command}\n\n`;

                    if (stdout) {
                        output += `--- STDOUT ---\n${stdout}\n`;
                    }
                    if (stderr) {
                        output += `--- STDERR ---\n${stderr}\n`;
                    }

                    if (error) {
                        output += `--- ERROR ---\nCommand failed with exit code ${error.code}.\n`;
                        resolve({ output });
                        return;
                    }

                    resolve({ output });
                });
            });
        }
    );
}
