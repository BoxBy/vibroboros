import { A2AClient } from "@a2a-js/sdk/client";
export declare class A2AClientSDK {
    private client;
    private constructor();
    /**
     * Asynchronously creates a new instance of the A2AClientSDK.
     * @param agentUrl The base URL of the agent (e.g., http://localhost:3001/agent/orchestrator)
     * @returns A Promise that resolves to a new A2AClientSDK instance.
     */
    static create(agentUrl: string): Promise<A2AClientSDK>;
    getAgentCard(): ReturnType<A2AClient['getAgentCard']>;
    sendMessage(params: Parameters<A2AClient['sendMessage']>[0]): ReturnType<A2AClient['sendMessage']>;
    /**
     * sendMessageStream now correctly handles the async generator returned by the SDK
     * and has a Promise<void> return type.
     */
    sendMessageStream(params: Parameters<A2AClient['sendMessageStream']>[0], onStreamEvent: (event: Awaited<ReturnType<A2AClient['sendMessageStream']>> extends AsyncGenerator<infer T, any, any> ? T : never) => void): Promise<void>;
    getTask(params: Parameters<A2AClient['getTask']>[0]): ReturnType<A2AClient['getTask']>;
}
