/**
 * @class LLMService
 * A service dedicated to handling communication with an OpenAI-compatible LLM.
 */
export class LLMService {

    /**
     * Generates a completion from the LLM based on a given prompt and context.
     * @param prompt The user's original query.
     * @param context The context gathered by the ContextManagementAgent.
     * @param apiKey The API key for the LLM service.
     * @param endpoint The API endpoint for the LLM service.
     * @returns A promise that resolves to the text content of the LLM's response.
     */
    public async generateCompletion(
        prompt: string,
        context: any,
        apiKey: string,
        endpoint: string
    ): Promise<string> {

        if (!apiKey) {
            return "Error: LLM API key is not configured. Please set it in the settings.";
        }

        const systemPrompt = `You are a helpful AI programming assistant integrated into VSCode.
        The user is asking a question about their project.
        Here is the context of their current workspace:
        - Active File: ${context.activeFilePath}
        - Language: ${context.language}
        - Open Files: ${context.openFiles.join(', ')}
        - Code Preview of Active File:
        ---
        ${context.contentPreview}
        ---
        Based on this context, please answer the user's question.`;

        try {
            // We assume a global fetch is available, as is common in modern Node.js environments.
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4", // This could also be a setting in the future
                    messages: [
                        {
                            role: "system",
                            content: systemPrompt
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ]
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error('[LLMService] API Error:', errorBody);
                return `Error: The LLM API returned a ${response.status} status.`;
            }

            const data = await response.json();
            return data.choices[0]?.message?.content || "No response from LLM.";

        } catch (error: any) {
            console.error('[LLMService] Failed to fetch LLM completion:', error);
            return `Error: Could not connect to the LLM service at ${endpoint}.`;
        }
    }
}
