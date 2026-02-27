/**
 * Message Transformer Interface
 *
 * Defines the contract for transforming A2A messages into UI commands.
 * This enables the PresentationMessageFactory to be extended without modification (OCP).
 */
import { UICommandMessage } from '../PresentationMessageFactory';

export interface IMessageTransformer {
    /**
     * The MIME type this transformer can handle
     */
    readonly mimeType: string;

    /**
     * Check if this transformer can handle the given MIME type
     */
    canTransform(mimeType: string): boolean;

    /**
     * Transform A2A data into a UI command message
     */
    transform(data: any, contextId?: string): UICommandMessage | null;
}

/**
 * Abstract base class for message transformers
 */
export abstract class BaseMessageTransformer implements IMessageTransformer {
    abstract readonly mimeType: string;

    canTransform(mimeType: string): boolean {
        return mimeType === this.mimeType;
    }

    abstract transform(data: any, contextId?: string): UICommandMessage | null;

    /**
     * Helper to create a standard UI command message
     */
    protected createUICommand(command: string, payload: any, contextId?: string): UICommandMessage {
        return {
            command,
            payload,
            sessionId: contextId
        };
    }
}
