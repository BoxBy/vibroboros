export interface A2AMessage<T> {
    messageId: string;
    type: string;
    payload: T;
    sender?: string;
    recipient?: string;
    timestamp?: string;
    contextId?: string;
    parts?: any[];
}
