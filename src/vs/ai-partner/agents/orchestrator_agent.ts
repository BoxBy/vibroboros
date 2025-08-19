import { Agent, IAgent } from "../agent";
import { A2AMessage } from "../core_data_structures";

/**
 * The OrchestratorAgent is the central hub for communication between all other agents.
 * It routes messages from a sender to the intended recipient.
 */
export class OrchestratorAgent extends Agent {
    private agents: Map<string, IAgent> = new Map();

    constructor() {
        // The Orchestrator sends messages to itself for routing.
        super('OrchestratorAgent', (msg) => this.handleMessage(msg));
    }

    /**
     * Registers an agent with the orchestrator, allowing it to send and receive messages.
     * @param agent The agent to register.
     */
    public registerAgent(agent: IAgent): void {
        if (this.agents.has(agent.name)) {
            console.warn(`Agent with name ${agent.name} is already registered.`);
            return;
        }
        this.agents.set(agent.name, agent);
        console.log(`Agent registered: ${agent.name}`);
    }

    /**
     * Unregisters an agent from the orchestrator.
     * @param agentName The name of the agent to unregister.
     */
    public unregisterAgent(agentName: string): void {
        if (this.agents.delete(agentName)) {
            console.log(`Agent unregistered: ${agentName}`);
        }
    }

    /**
     * Handles an incoming A2A message by routing it to the correct recipient agent.
     * This is the core logic of the orchestrator.
     * @param message The message to route.
     */
    public async handleMessage(message: A2AMessage): Promise<void> {
        const recipient = this.agents.get(message.recipient);

        if (!recipient) {
            console.error(`Orchestrator: Recipient agent "${message.recipient}" not found. Message from "${message.sender}" cannot be delivered.`);
            // Optionally, send an error message back to the sender
            if (message.sender && message.sender !== this.name) { // Avoid infinite loops
                await this.sendMessage({
                    sender: this.name,
                    recipient: message.sender,
                    type: 'error',
                    payload: { error: `Agent "${message.recipient}" not found.` },
                    timestamp: Date.now(),
                    correlationId: message.correlationId
                });
            }
            return;
        }

        // Forward the message to the recipient agent
        try {
            await recipient.handleMessage(message);
        } catch (error) {
            console.error(`Error while agent "${message.recipient}" was handling message from "${message.sender}":`, error);
        }
    }
}
