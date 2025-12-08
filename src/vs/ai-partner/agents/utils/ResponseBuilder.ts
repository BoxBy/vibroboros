import { Message } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';

/**
 * ResponseBuilder: Utility class for building SDK-compliant A2A Messages
 * Reduces boilerplate and ensures consistent response structure across agents
 */
export class ResponseBuilder {
    private messageId: string;
    private role: 'agent' | 'user';
    private parts: any[];
    private contextId?: string;

    constructor(role: 'agent' | 'user' = 'agent') {
        this.messageId = uuidv4();
        this.role = role;
        this.parts = [];
    }

    /**
     * Add a text part to the message
     */
    addText(text: string): ResponseBuilder {
        this.parts.push({ kind: 'text', text });
        return this;
    }

    /**
     * Add a data part with standard A2A JSON mime type
     */
    addData(data: any): ResponseBuilder {
        this.parts.push({
            kind: 'data',
            mimeType: 'application/vnd.a2a+json',
            data
        });
        return this;
    }

    /**
     * Add an artifact part
     */
    addArtifact(artifactId: string, mimeType: string, data: any, description?: string): ResponseBuilder {
        this.parts.push({
            kind: 'artifact',
            artifactId,
            mimeType,
            data,
            description
        });
        return this;
    }

    /**
     * Set the context ID for the message
     */
    setContextId(contextId: string): ResponseBuilder {
        this.contextId = contextId;
        return this;
    }

    /**
     * Set a custom message ID (optional, defaults to auto-generated UUID)
     */
    setMessageId(messageId: string): ResponseBuilder {
        this.messageId = messageId;
        return this;
    }

    /**
     * Build the final Message object
     */
    build(): Message {
        return {
            kind: 'message',
            messageId: this.messageId,
            role: this.role,
            parts: this.parts,
            contextId: this.contextId
        } as Message;
    }

    /**
     * Build and cast to any (for compatibility with current event bus types)
     */
    buildAsAny(): any {
        return this.build() as any;
    }

    /**
     * Static helper: Create a success response with text and data
     */
    static success(text: string, data: any, contextId?: string): Message {
        return new ResponseBuilder()
            .addText(text)
            .addData(data)
            .setContextId(contextId || '')
            .build();
    }

    /**
     * Static helper: Create an error response with text and error data
     */
    static error(errorMessage: string, contextId?: string, correlation?: string): Message {
        return new ResponseBuilder()
            .addText(`Error: ${errorMessage}`)
            .addData({ error: errorMessage, success: false, correlation })
            .setContextId(contextId || '')
            .build();
    }

    /**
     * Static helper: Create a simple text message
     */
    static text(text: string, contextId?: string): Message {
        return new ResponseBuilder()
            .addText(text)
            .setContextId(contextId || '')
            .build();
    }
}

