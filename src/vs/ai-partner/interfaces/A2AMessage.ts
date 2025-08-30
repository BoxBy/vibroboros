/**
 * @interface A2AMessage
 * Defines the standard structure for Agent-to-Agent (A2A) communication
 * within the multi-agent system.
 */
export interface A2AMessage<T> {
  /**
   * The unique identifier of the agent sending the message.
   */
  sender: string;

  /**
   * The unique identifier of the agent intended to receive the message.
   * Can be a specific agent ID or a broadcast identifier.
   */
  recipient: string;

  /**
   * Optional correlation ID to match requests with responses.
   */
  correlationId?: string;

  /**
   * The timestamp of when the message was created, in ISO 8601 format.
   */
  timestamp: string;

  /**
   * The type of the message, indicating the nature of the request or data.
   * e.g., 'request-code-analysis', 'response-code-summary', 'task-delegation'.
   */
  type: string;

  /**
   * The content of the message. The structure of the payload is dependent
   * on the message type.
   */
  payload: T;
}
