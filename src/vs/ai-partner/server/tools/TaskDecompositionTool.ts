import { z } from 'zod';

const inputSchema = z.object({
    tasks: z.array(z.string()).describe("List of sub-tasks to be added to the execution plan. Each task string should be clear and actionable."),
});

const outputSchema = z.object({
    message: z.string().describe("Confirmation message."),
    taskCount: z.number().describe("Number of tasks submitted."),
});

export function getTaskDecompositionToolDefinition() {
    return {
        name: 'submit_tasks',
        description: {
            title: "Submit Tasks",
            description: "Submit a list of decomposed sub-tasks to the Orchestrator for execution.",
            inputSchema: inputSchema,
            outputSchema: outputSchema,
        },
        handler: async ({ tasks }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
            // In a real system, this would interact with a TaskManager service.
            // For A2A context, we just return the list so the Orchestrator can parse it from the tool result.
            return {
                message: `Successfully submitted ${tasks.length} tasks.`,
                taskCount: tasks.length
            };
        }
    };
}
