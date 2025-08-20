import { exec } from 'child_process';

/**
 * @interface TerminalExecutionParams
 * Defines the parameters for the TerminalExecutionTool.
 */
interface TerminalExecutionParams {
  command: string;
}

/**
 * @class TerminalExecutionTool
 * A tool for executing shell commands.
 */
export class TerminalExecutionTool {
  /**
   * Executes the given shell command.
   * @param params The command to execute.
   * @returns A promise that resolves with the content array for the MCP result.
   */
  public execute(params: TerminalExecutionParams): Promise<any[]> {
    console.log('[TerminalExecutionTool] Executing with params:', params);

    if (!params.command) {
      throw new Error('Command parameter is required for TerminalExecutionTool.');
    }

    return new Promise((resolve, reject) => {
      exec(params.command, (error, stdout, stderr) => {
        if (error) {
          console.error(`[TerminalExecutionTool] Error: ${error.message}`);
          // Rejecting will be caught by the MCPServer and formatted as a JSON-RPC error.
          return reject(error);
        }

        // Return the output in the content format expected by the MCP server.
        resolve([
          {
            type: 'text',
            text: `Stdout:\n${stdout}`,
          },
          {
            type: 'text',
            text: `Stderr:\n${stderr}`,
          },
        ]);
      });
    });
  }
}
