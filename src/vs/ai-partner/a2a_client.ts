
import { A2AClient, AgentCard, Task, StreamEvent, SendMessageRequest, GetTaskRequest } from "@a2a-js/sdk";

export class A2AClientSDK {
    private client: A2AClient;

    constructor(baseUrl: string) {
        this.client = new A2AClient({ baseUrl });
    }

    public getAgentCard(): Promise<AgentCard> {
        return this.client.getAgentCard();
    }

    public sendMessage(req: SendMessageRequest): Promise<Task> {
        return this.client.sendMessage(req);
    }

    public sendMessageStream(req: SendMessageRequest, onStreamEvent: (event: StreamEvent) => void): Promise<void> {
        return this.client.sendMessageStream(req, onStreamEvent);
    }

    public getTask(req: GetTaskRequest): Promise<Task> {
        return this.client.getTask(req);
    }
}
