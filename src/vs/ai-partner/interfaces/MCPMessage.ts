/**
 * @file MCPMessage.ts
 * Defines the interface for Model-Controller-Protocol (MCP) messages,
 * adhering to the JSON-RPC 2.0 specification for client-server communication.
 */

/**
 * Defines the structure for a JSON-RPC 2.0 request or response object.
 * @template T The type of the params or result.
 */
export interface MCPMessage<T> {
  jsonrpc: '2.0';
  id: string | number | null;
  method?: string; // The name of the method to be invoked.
  params?: T;      // The parameters to be used during the invocation of the method.
  result?: any;
  error?: { code: number; message: string; data?: any; };
}

/**
 * Defines the structure for the payload within an MCP response.
 */
export interface MCPResponsePayload {
  content: any[];
}
