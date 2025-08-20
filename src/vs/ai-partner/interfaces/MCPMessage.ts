/**
 * @interface MCPMessage
 * Defines the structure for messages exchanged between the VSCode Extension (Client)
 * and the Local Tool Server (Server) using the Model-Controller-Protocol (MCP).
 */
export interface MCPMessage<T> {
  /**
   * A unique identifier for the message, used for tracking requests and responses.
   */
  id: string;

  /**
   * The version of the protocol. e.g., '1.0'.
   */
  version: string;

  /**
   * The type of the message, typically indicating the requested tool or action.
   * e.g., 'tool-request:WebSearch', 'tool-response:WebSearch'.
   */
  type: string;

  /**
   * The content of the message.
   */
  payload: T;
}

/**
 * @interface MCPRequestPayload
 * Defines a standard payload for a tool request from the client.
 */
export interface MCPRequestPayload {
  /**
   * The name of the tool to be executed.
   */
  tool: string;

  /**
   * The parameters required by the tool.
   */
  params: Record<string, any>;
}

/**
 * @interface MCPResponsePayload
 * Defines a standard payload for a tool response from the server.
 */
export interface MCPResponsePayload {
  /**
   * The status of the tool execution.
   */
  status: 'success' | 'error';

  /**
   * The data returned by the tool on success.
   */
  data?: any;

  /**
   * An error message if the tool execution failed.
   */
  error?: string;
}
