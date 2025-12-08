import { z } from 'zod';

const inputSchema = z.object({
    summary: z.string().describe("A brief, one-sentence summary of the work you have completed."),
});

const outputSchema = z.object({
    message: z.string().describe("A confirmation message."),
});

export function getTaskCompletionToolDefinition() {
    return {
        name: 'TaskCompletionTool',
        description: {
            title: "Complete Task",
            description: "Call this function ONLY when you are completely certain that all steps of the user's request have been successfully finished.",
            inputSchema: inputSchema,
            outputSchema: outputSchema,
        },
        handler: async ({ summary }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
            const message = `All tasks are complete. Summary: ${summary}`;
            return { message };
        }
    };
}
