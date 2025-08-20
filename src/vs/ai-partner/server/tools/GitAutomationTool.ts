/**
 * @interface GitAutomationParams
 * Defines the parameters for the GitAutomationTool.
 */
interface GitAutomationParams {
  // e.g., ['status'], ['commit', '-m', 'Initial commit']
  args: string[];
}

/**
 * @class GitAutomationTool
 * A tool for preparing and previewing Git commands.
 */
export class GitAutomationTool {
  /**
   * Prepares a Git command for execution.
   * @param params The Git command arguments.
   * @returns A promise that resolves with the content array for the MCP result.
   */
  public async execute(params: GitAutomationParams): Promise<any[]> {
    console.log('[GitAutomationTool] Executing with params:', params);

    if (!params.args || params.args.length === 0) {
      throw new Error('Args parameter is required for GitAutomationTool.');
    }

    const command = `git ${params.args.join(' ')}`;

    // Return the prepared command in the content format expected by the MCP server.
    return [
      {
        type: 'text',
        text: `Prepared command: ${command}`,
      },
    ];
  }
}
