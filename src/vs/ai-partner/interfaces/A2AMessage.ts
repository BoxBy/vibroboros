export interface A2AMessage<T> {
    type: string;
    payload: T;
    sender?: string;
    recipient?: string;
    timestamp?: string;
}
