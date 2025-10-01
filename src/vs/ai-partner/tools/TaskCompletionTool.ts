import { McpServer } from '@modelcontextprotocol/sdk';
import { z } from 'zod';

export function registerTaskCompletionTool(server: McpServer) {
    server.registerTool(
        'TaskCompletionTool',
        {
            title: "Complete Task",
            description: "Call this function ONLY when you are completely certain that all steps of the user's request have been successfully finished.",
            inputSchema: z.object({
                summary: z.string().describe("A brief, one-sentence summary of the work you have completed."),
            }),
            outputSchema: z.object({
                message: z.string().describe("A confirmation message."),
            }),
        },
        async ({ summary }) => {
            const message = `All tasks are complete. Summary: ${summary}`;
            return { message };
        }
    );
}