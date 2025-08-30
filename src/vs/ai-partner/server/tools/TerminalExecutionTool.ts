import * as vscode from 'vscode';
import { exec, ExecOptions } from 'child_process';

/**
 * @interface TerminalExecutionParams
 * Defines the parameters for the TerminalExecutionTool.
 */
interface TerminalExecutionParams {
  command: string;
  cwd?: string; // Optional: current working directory
}

/**
 * @class TerminalExecutionTool
 * A tool for executing shell commands within a specified working directory.
 */
export class TerminalExecutionTool {
  /**
   * Returns the JSON schema for the tool's input parameters.
   */
  public getSchema() {
    return {
      type: "function",
      function: {
        name: "TerminalExecutionTool",
        description: "Executes a shell command in the terminal. Use this for general commands like `ls`, `npm install`, etc. The command runs in the root of the current workspace unless `cwd` is specified.",
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The shell command to execute.",
            },
            cwd: {
              type: "string",
              description: "Optional. The working directory to run the command in. Defaults to the workspace root.",
            },
          },
          required: ["command"],
        },
      },
    };
  }

  /**
   * Executes the given shell command.
   * @param params The command and optional working directory.
   * @returns A promise that resolves with the content array for the MCP result.
   */
  public execute(params: TerminalExecutionParams): Promise<any[]> {
    console.log('[TerminalExecutionTool] Executing with params:', params);

    if (!params.command) {
      throw new Error('Command parameter is required for TerminalExecutionTool.');
    }

    const defaultCwd = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
    const options: ExecOptions = {
      cwd: params.cwd || defaultCwd,
    };

    if (!options.cwd) {
        throw new Error('Could not determine a working directory. Please open a folder or specify a `cwd`.');
    }

    return new Promise((resolve) => {
      exec(params.command, options, (error, stdout, stderr) => {
        let output = `> Executed in: ${options.cwd}\n> Command: ${params.command}\n\n`;

        if (stdout) {
          output += `--- STDOUT ---\n${stdout}\n`;
        }
        if (stderr) {
          output += `--- STDERR ---\n${stderr}\n`;
        }

        if (error) {
          output += `--- ERROR ---\nCommand failed with exit code ${error.code}.\n`;
          resolve([
            {
              type: 'text',
              text: output,
            },
          ]);
          return;
        }

        resolve([
          {
            type: 'text',
            text: output,
          },
        ]);
      });
    });
  }
}
