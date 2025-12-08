type JSONRPCMessage = any;
type MessageExtraInfo = any;
export interface SimpleTransport {
    onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;
    onclose?: () => void;
    onerror?: (error: Error) => void;
    start(): Promise<void>;
    send(message: JSONRPCMessage, options?: any): Promise<void>;
    close(): Promise<void>;
}
export declare function createInProcessDuplex(): {
    serverTransport: any;
    clientTransport: any;
};
export {};
