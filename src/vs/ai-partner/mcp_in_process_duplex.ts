// Lightweight in-process duplex transport for MCP Server <-> Client
// Avoids relying on SDK transport types to keep TS happy across versions.

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

class InProcessEndpoint implements SimpleTransport {
  onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  private pending: JSONRPCMessage[] = [];

  constructor(private getPeer: () => InProcessEndpoint | undefined) {}

  async start(): Promise<void> { /* no-op */ }

  async send(message: JSONRPCMessage, _options?: any): Promise<void> {
    const peer = this.getPeer();
    if (!peer) { throw new Error('Not connected'); }
    // If receiver not ready yet, wait briefly for onmessage to be attached
    if (typeof peer.onmessage !== 'function') {
      const maxWaitMs = 200;
      const stepMs = 10;
      let waited = 0;
      while (waited < maxWaitMs && typeof peer.onmessage !== 'function') {
        await new Promise(r => setTimeout(r, stepMs));
        waited += stepMs;
      }
    }
    if (typeof peer.onmessage !== 'function') { throw new Error('Not connected'); }
    try {
      peer.onmessage!(message);
    } catch (e: any) {
      this.onerror?.(e);
      throw e;
    }
  }

  async close(): Promise<void> {
    try { this.onclose?.(); } catch {}
  }
}

export function createInProcessDuplex() {
  let serverEp: InProcessEndpoint | undefined;
  let clientEp: InProcessEndpoint | undefined;
  serverEp = new InProcessEndpoint(() => clientEp);
  clientEp = new InProcessEndpoint(() => serverEp);
  return { serverTransport: serverEp as any, clientTransport: clientEp as any };
}
