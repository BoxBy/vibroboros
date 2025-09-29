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

/**
 * @class LLMService
 * @description Manages all communication with a remote Large Language Model (LLM).
 * This service is responsible for sending prompts, handling API keys,
 * processing streamed responses, and managing connection and API errors.
 */
export class LLMService {

    /**
     * Creates an instance of LLMService.
     */
    public constructor() {}

    /**
     * Requests a completion from the LLM, with optional support for streaming.
     * @param {LlmMessage[]} conversationHistory - The sequence of messages representing the conversation so far.
     * @param {string} apiKey - The API key for authenticating with the LLM service.
     * @param {string} endpoint - The URL of the OpenAI-compatible API endpoint.
     * @param {any[]} tools - A list of tool definitions that the LLM can use.
     * @param {string} model - The identifier of the language model to use for the completion.
     * @param {(chunk: string) => void} [onChunk] - An optional callback to handle streaming response chunks. If provided, streaming is enabled.
     * @returns {Promise<LlmFullResponse>} A promise that resolves to the full response object from the LLM.
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
            let connectErrorMessage = `**Connection Error:** Could not connect to the LLM service at 
${endpoint}
.`;
            return { choices: [{ message: { role: 'assistant', content: connectErrorMessage } }] };
        }
    }

    /**
     * Processes a streamed response from the LLM API.
     * It reads the stream chunk by chunk, decodes it, and parses the server-sent events (SSE).
     * As content and tool calls are received, they are accumulated and the onChunk callback is fired for content.
     * @param {ReadableStream<Uint8Array>} stream - The response body stream from the fetch API.
     * @param {(chunk: string) => void} onChunk - The callback to execute for each piece of content received.
     * @returns {Promise<LlmFullResponse>} A promise that resolves to the fully assembled response once the stream is complete.
     * @private
     */
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