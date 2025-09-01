// in: vibroborus/src/vs/ai-partner/server/tools/TaskCompletionTool.ts

/**
 * @class TaskCompletionTool
 * A special tool that the LLM calls to signal that it has completed all tasks
 * and is ready to provide a final summary to the user.
 */
export class TaskCompletionTool {
	/**
	 * @returns {object} The JSON schema for the tool, defining its structure and parameters.
	 */
	public getSchema() {
		return {
			type: "function",
			function: {
				name: "TaskCompletionTool",
				description: "Call this function ONLY when you are completely certain that all steps of the user's request have been successfully finished. This signals you are ready to provide the final summary.",
				parameters: {
					type: "object",
					properties: {
						summary: {
							type: "string",
							description: "A brief, one-sentence summary of the work you have completed.",
						},
					},
					required: ["summary"],
				},
			},
		};
	}

	/**
	 * Executes the tool, returning the summary provided by the LLM.
	 * @param params The parameters for the tool call.
	 * @returns {Promise<any[]>} A promise that resolves with the content for the MCP result.
	 */
	public async execute(params: { summary: string }): Promise<any[]> {
		return [
			{
				type: 'text',
				text: `All tasks are complete. Summary: ${params.summary}`,
			},
		];
	}
}