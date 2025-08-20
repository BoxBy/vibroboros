/**
 * @interface GitAutomationParams
 * Defines the parameters for the GitAutomationTool.
 */
interface GitAutomationParams {
  args: string[];
}

/**
 * @class GitAutomationTool
 * A tool for preparing and previewing Git commands.
 */
export class GitAutomationTool {
  /**
   * Prepares a Git command and returns a structured, actionable response for the UI.
   * @param params The Git command arguments.
   * @returns A promise that resolves with the content array for the MCP result.
   */
  public async execute(params: GitAutomationParams): Promise<any[]> {
    console.log('[GitAutomationTool] Executing with params:', params);

    if (!params.args || params.args.length === 0) {
      throw new Error('Args parameter is required for GitAutomationTool.');
    }

    const commandStr = `git ${params.args.join(' ')}`;

    // Instead of just text, return a structured object that the UI can render as a button.
    return [
      {
        type: 'text',
        text: `Prepared command: ${commandStr}`,
      },
      {
        type: 'ui-action', // A custom type for the UI to interpret.
        action: {
          label: `Run '${commandStr}'`,
          command: 'runTerminalCommand', // The command to send back to the orchestrator.
          payload: { commandString: commandStr }, // The data for that command.
        },
      },
    ];
  }
}
