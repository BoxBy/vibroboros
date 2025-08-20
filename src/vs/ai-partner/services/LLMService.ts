/**
 * @class LLMService
 * A service dedicated to handling communication with an OpenAI-compatible LLM,
 * including support for tool-calling.
 */
export class LLMService {

    /**
     * Requests a completion from the LLM, providing context and a list of available tools.
     * @param prompt The user's original query.
     * @param context The context gathered by the ContextManagementAgent.
     * @param apiKey The API key for the LLM service.
     * @param endpoint The API endpoint for the LLM service.
     * @param tools An array of tool schemas available for the LLM to use.
     * @returns A promise that resolves to the full message object from the LLM response.
     */
    public async requestLLMCompletion(
        prompt: string,
        context: any,
        apiKey: string,
        endpoint: string,
        tools: any[]
    ): Promise<any> { // Returns the entire message object

        if (!apiKey) {
            return { content: "Error: LLM API key is not configured. Please set it in the settings." };
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
        Based on this context, please answer the user's question or use one of the available tools to assist them.`;

        const requestBody = {
            model: "gpt-4", // This could also be a setting
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ],
            tools: tools, // Provide the list of tools to the LLM
            tool_choice: "auto", // Let the LLM decide when to use tools
        };

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error('[LLMService] API Error:', errorBody);
                return { content: `Error: The LLM API returned a ${response.status} status.` };
            }

            const data = await response.json();
            return data.choices[0]?.message || { content: "No response from LLM." };

        } catch (error: any) {
            console.error('[LLMService] Failed to fetch LLM completion:', error);
            return { content: `Error: Could not connect to the LLM service at ${endpoint}.` };
        }
    }
}
