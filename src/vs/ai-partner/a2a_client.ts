import { MessageSendParams, SendMessageResult, TaskQueryParams, Task, StreamEvent, AgentCard } from "./core_data_structures";

/**
 * A client for interacting with an A2A (Agent-to-Agent) server over HTTP.
 * Uses the global fetch available in modern Node runtimes bundled with VS Code.
 */
export class A2AClient {
    private baseUrl: string;

    constructor(baseUrl: string) {
        // Ensure the base URL doesn't end with a slash
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    }

    private async _sendJsonRpcRequest(method: string, params: any): Promise<any> {
        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(), // Simple ID generation
                method,
                params,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const jsonResponse = await response.json();
        if (jsonResponse.error) {
            throw new Error(`A2A Error: ${jsonResponse.error.message} (Code: ${jsonResponse.error.code})`);
        }

        return jsonResponse.result;
    }

    /**
     * Retrieves the agent's card, which describes its capabilities.
     * @returns The AgentCard object.
     */
    public async getAgentCard(): Promise<AgentCard> {
        return this._sendJsonRpcRequest('getAgentCard', {});
    }

    /**
     * Sends a message to the agent and gets a direct or task-based response.
     * @param params The parameters for sending the message.
     * @returns The result of the message, either a Task or a direct Message.
     */
    public async sendMessage(params: MessageSendParams): Promise<SendMessageResult> {
        return this._sendJsonRpcRequest('sendMessage', params);
    }

    /**
     * Sends a message and opens a stream for real-time updates.
     * @param params The parameters for sending the message.
     * @param onStreamEvent A callback function to handle each incoming stream event.
     * @param signal An AbortSignal to cancel the fetch request.
     * @returns A promise that resolves when the stream is closed.
     */
    public async sendMessageStream(params: MessageSendParams, onStreamEvent: (event: StreamEvent) => void, signal?: AbortSignal): Promise<void> {
        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/x-ndjson',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'sendMessageStream',
                params,
            }),
            signal, // Pass the signal to fetch
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
            throw new Error('Response body is null, cannot start streaming.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            for (let i = 0; i < lines.length - 1; i++) {
                const line = lines[i].trim();
                if (line) {
                    try {
                        const event: StreamEvent = JSON.parse(line);
                        onStreamEvent(event);
                    } catch (error) {
                        console.error('[A2AClient] Failed to parse stream event:', error, 'Line:', line);
                    }
                }
            }
            buffer = lines[lines.length - 1];
        }

        const lastLine = buffer.trim();
        if (lastLine) {
            try {
                const event: StreamEvent = JSON.parse(lastLine);
                onStreamEvent(event);
            } catch (error) {
                console.error('[A2AClient] Failed to parse final stream event:', error, 'Line:', lastLine);
            }
        }
    }

    /**
     * Retrieves the current state and details of a task.
     * @param params The query parameters to get the task.
     * @returns The requested Task object.
     */
    public async getTask(params: TaskQueryParams): Promise<Task> {
        return this._sendJsonRpcRequest('getTask', params);
    }
}
