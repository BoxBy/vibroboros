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
   * Returns the JSON schema for the tool's input parameters.
   */
  public getSchema() {
    return {
      type: "function",
      function: {
        name: "GitAutomationTool",
        description: "Prepares a Git command for execution. Use this for git operations like status, log, diff, etc.",
        parameters: {
          type: "object",
          properties: {
            args: {
              type: "array",
              items: { "type": "string" },
              description: "The arguments to pass to the git command, e.g., ['status'] or ['log', '-1'].",
            },
          },
          required: ["args"],
        },
      },
    };
  }

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

    return [
      {
        type: 'text',
        text: `Prepared command: ${commandStr}`,
      },
      {
        type: 'ui-action',
        action: {
          label: `Run '${commandStr}'`,
          command: 'runTerminalCommand',
          payload: { commandString: commandStr },
        },
      },
    ];
  }
}
