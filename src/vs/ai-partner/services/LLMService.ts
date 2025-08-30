/**
 * @file LLMService.ts
 * A service dedicated to handling communication with an OpenAI-compatible LLM,
 * including robust error handling.
 */

// Define and export the message type for clarity and reuse across the extension.
export type LlmMessage = {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
};

export class LLMService {

    public constructor() {}

    /**
     * Requests a completion from the LLM.
     * @returns A promise that resolves to the full message object from the LLM response.
     */
    public async requestLLMCompletion(
        conversationHistory: LlmMessage[], // Use the specific type
        apiKey: string,
        endpoint: string,
        tools: any[],
        model: string
    ): Promise<LlmMessage> { // The return type could be refined to LlmMessage in the future

        if (!apiKey) {
            return { role: 'assistant', content: "**Error:** LLM API key is not configured. Please go to Settings to add your API key." };
        }

        const requestBody = {
            model: model,
            messages: conversationHistory,
            tools: tools,
            tool_choice: "auto",
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
                let errorMessage = `API Error: The server responded with a status of ${response.status}.`;
                if (response.status === 401) {
                    errorMessage = "**Authentication Error:** The provided API key is invalid or has expired. Please check your settings.";
                } else if (response.status === 404) {
                    errorMessage = "**Endpoint Not Found:** The API endpoint URL is incorrect. Please check your settings.";
                } else {
                    const errorBody = await response.text();
                    errorMessage += `\n\nDetails: ${errorBody}`;
                }
                console.error('[LLMService] API Error:', errorMessage);
                return { role: 'assistant', content: errorMessage };
            }

            const data = await response.json();
            return data.choices[0]?.message || { role: 'assistant', content: "**Error:** Received an empty response from the LLM." };

        } catch (error: any) {
            console.error('[LLMService] Failed to fetch LLM completion:', error);
            let connectErrorMessage = `**Connection Error:** Could not connect to the LLM service at \`${endpoint}\`.`;
            if (error.cause?.code === 'ENOTFOUND') {
                connectErrorMessage += "\n\nPlease check the server address and your network connection.";
            }
            return { role: 'assistant', content: connectErrorMessage };
        }
    }
}
