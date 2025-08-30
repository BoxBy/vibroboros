import { Agent } from "../agent";
import { A2AMessage } from "../interfaces/A2AMessage";

interface PendingRequest {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
}

/**
 * The UIAgent acts as the interface between the VSCode UI and the internal agent system.
 * It sends requests initiated by UI commands and handles responses back to the UI.
 */
export class UIAgent extends Agent {
    private pendingRequests = new Map<string, PendingRequest>();

    constructor(messageSender: (message: A2AMessage<any>) => Promise<void>) {
        super('UIAgent', messageSender);
    }

    public async handleMessage(message: A2AMessage<any>): Promise<void> {
        console.log(`[${this.name}] received message of type "${message.type}" from [${message.sender}].`);

        if (message.correlationId && this.pendingRequests.has(message.correlationId)) {
            const pendingRequest = this.pendingRequests.get(message.correlationId);
            if (pendingRequest) {
                this.pendingRequests.delete(message.correlationId);
                if (message.type === 'error') {
                    pendingRequest.reject(message.payload.error);
                } else {
                    pendingRequest.resolve(message.payload);
                }
            }
        } else {
            console.warn(`[${this.name}] Received unhandled message:`, message);
            // Potentially handle other types of notifications from agents to UI
        }
    }

    /**
     * Sends a request message to another agent and waits for a correlated response.
     * @param recipient The name of the agent to send the message to.
     * @param type The type of the message (e.g., 'list_mcp_tools').
     * @param payload The payload of the message.
     * @returns A promise that resolves with the response payload or rejects on error.
     */
    public sendRequestAndWaitForResponse(recipient: string, type: string, payload: any): Promise<any> {
        return new Promise(async (resolve, reject) => {
            const correlationId = `${new Date().toISOString()}-${Math.random().toString(36).substring(2, 9)}`;
            this.pendingRequests.set(correlationId, { resolve, reject });

            try {
                await this.sendMessage({
                    sender: this.name,
                    recipient: recipient,
                    type: type,
                    payload: payload,
                    timestamp: new Date().toISOString(),
                    correlationId: correlationId
                });
            } catch (error) {
                this.pendingRequests.delete(correlationId);
                reject(error);
            }
        });
    }
}
