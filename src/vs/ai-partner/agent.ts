import { A2AMessage } from "./interfaces/A2AMessage";

/**
 * Defines the core capabilities of all agents in the system.
 */
export interface IAgent {
    readonly name: string;

    /**
     * Handles an incoming message from another agent.
     * @param message The A2A message to process.
     */
    handleMessage(message: A2AMessage<any>): Promise<void>;

    /**
     * Sends a message to another agent via the Orchestrator.
     * @param message The A2A message to send.
     */
    sendMessage(message: A2AMessage<any>): Promise<void>;
}

/**
 * An abstract base class for agents, providing common functionality.
 */
export abstract class Agent implements IAgent {
    public readonly name: string;
    private messageSender: (message: A2AMessage<any>) => Promise<void>;

    constructor(name: string, messageSender: (message: A2AMessage<any>) => Promise<void>) {
        this.name = name;
        this.messageSender = messageSender;
    }

    /**
     * Abstract method to be implemented by concrete agent classes.
     * This is the entry point for an agent to process a message.
     */
    public abstract handleMessage(message: A2AMessage<any>): Promise<void>;

    /**
     * Sends a message to another agent using the provided sender function (typically the Orchestrator).
     */
    public async sendMessage(message: A2AMessage<any>): Promise<void> {
        // Set the sender to this agent's name before sending
        const messageToSend: A2AMessage<any> = { ...message, sender: this.name };
        await this.messageSender(messageToSend);
    }
}
