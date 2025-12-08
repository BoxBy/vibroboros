import { z } from 'zod';
import { exec, ExecOptions } from 'child_process';
import * as vscode from 'vscode';

const inputSchema = z.object({
    args: z.array(z.string()).describe("The arguments to pass to the git command, e.g., ['status'] or ['log', '-1']."),
});

const outputSchema = z.object({
    output: z.string().describe("The output of the git command."),
});

export function getGitAutomationToolDefinition() {
    return {
        name: 'GitAutomationTool',
        description: {
            title: "Git Automation",
            description: "Executes a Git command.",
            inputSchema: inputSchema,
            outputSchema: outputSchema,
        },
        handler: async ({ args }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
            if (!args || args.length === 0) {
                throw new Error('Args parameter is required for GitAutomationTool.');
            }

            const command = `git ${args.join(' ')}`;

            const defaultCwd = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
            const options: ExecOptions = {
                cwd: defaultCwd,
            };

            if (!options.cwd) {
                throw new Error('Could not determine a working directory. Please open a folder.');
            }

            return new Promise((resolve, reject) => {
                exec(command, options, (error, stdout, stderr) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    if (stderr) {
                        resolve({ output: stderr });
                        return;
                    }
                    resolve({ output: stdout });
                });
            });
        }
    };
}
