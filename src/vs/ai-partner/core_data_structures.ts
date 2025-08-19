/**
 * Defines the core data structures for the Agent-to-Agent (A2A) communication protocol.
 * Based on the A2A JavaScript SDK documentation.
 */

// 1. Agent Card: Describes an agent's capabilities and metadata.
export interface AgentCard {
    name: string;
    description: string;
    url: string; // Base URL for the agent server
    provider: {
        organization: string;
        url?: string;
    };
    protocolVersion: string; // e.g., "0.3.0"
    version: string; // Agent's own version
    capabilities: {
        streaming: boolean;
        pushNotifications: boolean;
        stateTransitionHistory: boolean;
    };
    securitySchemes?: any; // Define more specifically if needed
    security?: any;
    defaultInputModes: string[]; // e.g., ["text/plain"]
    defaultOutputModes: string[]; // e.g., ["text/plain"]
    skills: Skill[];
    supportsAuthenticatedExtendedCard: boolean;
}

export interface Skill {
    id: string;
    name: string;
    description: string;
    tags: string[];
    examples: string[];
    inputModes: string[];
    outputModes: string[];
}

// 2. Message and Task Structures: The core communication objects.

export interface MessagePart {
    kind: 'text' | string; // Extensible for other kinds like 'image'
    text?: string;
}

export interface Message {
    kind: 'message';
    messageId: string;
    role: 'user' | 'agent';
    parts: MessagePart[];
    taskId?: string;
    contextId?: string;
    metadata?: any;
}

export interface TaskStatus {
    state: 'submitted' | 'working' | 'completed' | 'canceled' | 'error';
    message?: Message;
    timestamp: string; // ISO 8601 format
}

export interface TaskArtifact {
    artifactId: string;
    name: string;
    parts: MessagePart[];
}

export interface Task {
    kind: 'task';
    id: string;
    contextId: string;
    status: TaskStatus;
    history: Message[];
    metadata?: any;
    artifacts: TaskArtifact[];
}

// 3. A2A Client/Server Method Parameters and Responses

export interface MessageSendParams {
    message: Message;
    configuration?: {
        blocking?: boolean;
        acceptedOutputModes?: string[];
    };
}

export type SendMessageResult = Task | Message;

export interface TaskQueryParams {
    id: string;
}

// 4. Streaming Event Structures

export interface TaskStatusUpdateEvent {
    kind: 'status-update';
    taskId: string;
    contextId: string;
    status: TaskStatus;
    final: boolean;
}

export interface TaskArtifactUpdateEvent {
    kind: 'artifact-update';
    taskId: string;
    contextId: string;
    artifact: TaskArtifact;
    append: boolean;
    lastChunk: boolean;
}

export type StreamEvent = Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent | Message;
