/**
 * @file LLMService.ts
 * A service dedicated to handling communication with an OpenAI-compatible LLM,
 * including robust error handling and response streaming.
 */

export type LlmMessage = {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    pruningState?: 'pending' | 'keep' | 'prune';
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
};

export interface LlmFullResponse {
    choices: { message: LlmMessage }[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export class LLMService {

    public constructor() {}

    /**
     * Requests a completion from the LLM, with optional support for streaming.
     * @param onChunk - An optional callback to handle streaming response chunks.
     * @returns A promise that resolves to the full response object from the LLM.
     */
	public async requestLLMCompletion(
		conversationHistory: LlmMessage[],
		apiKey: string,
		endpoint: string,
		tools: any[],
		model: string,
        onChunk?: (chunk: string) => void
	): Promise<LlmFullResponse> {

		if (!apiKey) {
			return { choices: [{ message: { role: 'assistant', content: "**Error:** LLM API key is not configured. Please go to Settings to add your API key." } }] };
		}

		const requestBody: any = {
			model: model,
			messages: conversationHistory,
			tools: tools,
			tool_choice: "auto",
		};

        // Enable streaming if a callback is provided
        if (onChunk) {
            requestBody.stream = true;
        }

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
                // ... (error handling as before)
                return { choices: [{ message: { role: 'assistant', content: errorMessage } }] };
            }

            // Handle streaming response
            if (onChunk && response.body) {
                return this.handleStreamedResponse(response.body, onChunk);
            } else {
                // Handle non-streaming response
                const data = await response.json();
                if (!data.choices || data.choices.length === 0) {
                    // ... (error handling as before)
                }
                return data;
            }

        } catch (error: any) {
            // ... (error handling as before)
            let connectErrorMessage = `**Connection Error:** Could not connect to the LLM service at \`${endpoint}\`.`;
            return { choices: [{ message: { role: 'assistant', content: connectErrorMessage } }] };
        }
    }

    private async handleStreamedResponse(
        stream: ReadableStream<Uint8Array>,
        onChunk: (chunk: string) => void
    ): Promise<LlmFullResponse> {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = '';
        let accumulatedToolCalls: any[] = [];
        let usage: any = {};

        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep the last, possibly incomplete, line

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6);
                    if (jsonStr === '[DONE]') {
                        break;
                    }

                    try {
                        const chunk = JSON.parse(jsonStr);
                        const delta = chunk.choices?.[0]?.delta;

                        if (delta?.content) {
                            const contentChunk = delta.content;
                            accumulatedContent += contentChunk;
                            onChunk(contentChunk); // Fire the callback with the new chunk
                        }

                        if (delta?.tool_calls) {
                            // This logic handles accumulating tool calls from multiple chunks
                            delta.tool_calls.forEach((toolCall: any, index: number) => {
                                if (!accumulatedToolCalls[index]) {
                                    accumulatedToolCalls[index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
                                }
                                if (toolCall.id) {
                                    accumulatedToolCalls[index].id = toolCall.id;
                                }
                                if (toolCall.function?.name) {
                                    accumulatedToolCalls[index].function.name = toolCall.function.name;
                                }
                                if (toolCall.function?.arguments) {
                                    accumulatedToolCalls[index].function.arguments += toolCall.function.arguments;
                                }
                            });
                        }
                        if (chunk.usage) {
                            usage = chunk.usage;
                        }
                    } catch (e) {
                        console.error('[LLMService] Error parsing stream chunk:', e);
                    }
                }
            }
        }

        const finalMessage: LlmMessage = { role: 'assistant', content: accumulatedContent };
        if (accumulatedToolCalls.length > 0) {
            finalMessage.tool_calls = accumulatedToolCalls;
        }

        return { choices: [{ message: finalMessage }], usage: usage };
    }
}
