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
   * Executes the given shell command.
   * @param params The command and optional working directory.
   * @returns A promise that resolves with the content array for the MCP result.
   */
  public execute(params: TerminalExecutionParams): Promise<any[]> {
    console.log('[TerminalExecutionTool] Executing with params:', params);

    if (!params.command) {
      throw new Error('Command parameter is required for TerminalExecutionTool.');
    }

    // Determine the working directory. Default to the first workspace folder if available.
    const defaultCwd = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
    const options: ExecOptions = {
      cwd: params.cwd || defaultCwd,
    };

    if (!options.cwd) {
        throw new Error('Could not determine a working directory. Please open a folder or specify a `cwd`.');
    }

    return new Promise((resolve, reject) => {
      exec(params.command, options, (error, stdout, stderr) => {
        // Even if there's an error, we often want to see stdout/stderr.
        // We will format the output to clearly show the result.
        let output = `> Executed in: ${options.cwd}\n> Command: ${params.command}\n\n`;

        if (stdout) {
          output += `--- STDOUT ---\n${stdout}\n`;
        }
        if (stderr) {
          output += `--- STDERR ---\n${stderr}\n`;
        }

        if (error) {
          output += `--- ERROR ---\nCommand failed with exit code ${error.code}.\n`;
          // We resolve with the output instead of rejecting, so the user can see what happened.
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
