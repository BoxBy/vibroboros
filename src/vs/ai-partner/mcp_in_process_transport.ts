import { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport';
import { Server } from '@modelcontextprotocol/sdk/server';
import { JSONRPCMessage, MessageExtraInfo } from '@modelcontextprotocol/sdk/types';

export class InProcessMcpTransport implements Transport {
    onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;
    onclose?: () => void;
    onerror?: (error: Error) => void;
    sessionId?: string;
    setProtocolVersion?: (version: string) => void;

    constructor(private server: Server) { }

    async start(): Promise<void> { }

    async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
        if (this.onmessage) {
            this.onmessage(message);
        }
    }

    async close(): Promise<void> {
        if (this.onclose) {
            this.onclose();
        }
    }
}
