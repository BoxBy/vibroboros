
import { A2AClientSDK } from "./a2a_client";
import { StreamEvent } from "@a2a-js/sdk";

export class UIAgent {
    constructor(private a2aClient: A2AClientSDK) {}

    public async sendRequestAndStreamResponse(
        prompt: string,
        onStreamEvent: (event: StreamEvent) => void
    ): Promise<void> {
        await this.a2aClient.sendMessageStream({ message: { content: prompt } }, onStreamEvent);
    }
}
