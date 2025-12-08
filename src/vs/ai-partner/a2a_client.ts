import { A2AClient } from "@a2a-js/sdk/client";

export class A2AClientSDK {
    private client: A2AClient;

    // The constructor is now private to enforce creation via the async factory method.
    private constructor(client: A2AClient) {
        this.client = client;
    }

    /**
     * Asynchronously creates a new instance of the A2AClientSDK.
     * @param agentUrl The base URL of the agent (e.g., http://localhost:3001/agent/orchestrator)
     * @returns A Promise that resolves to a new A2AClientSDK instance.
     */
    public static async create(agentUrl: string): Promise<A2AClientSDK> {
        // fromCardUrl fetches the agent's card and constructs the client properly.
        const client = await A2AClient.fromCardUrl(agentUrl);
        return new A2AClientSDK(client);
    }

    public getAgentCard(): ReturnType<A2AClient['getAgentCard']> {
        return this.client.getAgentCard();
    }

    public sendMessage(params: Parameters<A2AClient['sendMessage']>[0]): ReturnType<A2AClient['sendMessage']> {
        return this.client.sendMessage(params);
    }

    /**
     * sendMessageStream now correctly handles the async generator returned by the SDK
     * and has a Promise<void> return type.
     */
    public async sendMessageStream(params: Parameters<A2AClient['sendMessageStream']>[0], onStreamEvent: (event: Awaited<ReturnType<A2AClient['sendMessageStream']>> extends AsyncGenerator<infer T, any, any> ? T : never) => void): Promise<void> {
        const taskStream = this.client.sendMessageStream(params);
        for await (const event of taskStream) {
            onStreamEvent(event);
        }
    }

    public getTask(params: Parameters<A2AClient['getTask']>[0]): ReturnType<A2AClient['getTask']> {
        return this.client.getTask(params);
    }
}