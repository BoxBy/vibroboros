import { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport';
import { Server } from '@modelcontextprotocol/sdk/server';
import { JSONRPCMessage, MessageExtraInfo } from '@modelcontextprotocol/sdk/types';
export declare class InProcessMcpTransport implements Transport {
    private server;
    onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;
    onclose?: () => void;
    onerror?: (error: Error) => void;
    sessionId?: string;
    setProtocolVersion?: (version: string) => void;
    constructor(server: Server);
    start(): Promise<void>;
    send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void>;
    close(): Promise<void>;
}
