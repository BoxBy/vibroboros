
// Based on the Model Context Protocol (MCP) documentation provided.

// Base JSON-RPC structures
export interface JsonRpcMessage {
    jsonrpc: '2.0';
}

export interface JsonRpcRequest extends JsonRpcMessage {
    id: number | string;
    method: string;
    params?: any;
}

export interface JsonRpcResponse extends JsonRpcMessage {
    id: number | string;
    result?: any;
    error?: JsonRpcError;
}

export interface JsonRpcNotification extends JsonRpcMessage {
    method: string;
    params?: any;
}

export interface JsonRpcError {
    code: number;
    message: string;
    data?: any;
}

// MCP Specific Interfaces

// Lifecycle Management
export interface ClientInfo {
    name: string;
    version: string;
}

export interface ServerInfo {
    name: string;
    version: string;
}

export interface ClientCapabilities {
    elicitation?: {};
    // Other client capabilities can be added here.
}

export interface ServerCapabilities {
    tools?: {
        listChanged?: boolean;
    };
    resources?: {};
    prompts?: {};
    // Other server capabilities can be added here.
}

export interface InitializeParams {
    protocolVersion: string;
    capabilities: ClientCapabilities;
    clientInfo: ClientInfo;
}

export interface InitializeResult {
    protocolVersion: string;
    capabilities: ServerCapabilities;
    serverInfo: ServerInfo;
}

// Primitives: Tools
export interface JsonSchema {
    type: string;
    properties?: { [key: string]: JsonSchema };
    required?: string[];
    enum?: string[];
    description?: string;
    default?: any;
}

export interface Tool {
    name: string;
    title: string;
    description: string;
    inputSchema: JsonSchema;
}

export interface ToolsListResult {
    tools: Tool[];
}

export interface ToolsCallParams {
    name: string;
    arguments: { [key: string]: any };
}

export interface ContentPart {
    type: 'text' | string; // Supports other types like 'image', 'resource'
    text?: string;
    // Other content fields can be added here.
}

export interface ToolsCallResult {
    content: ContentPart[];
}

// Primitives: Resources (Basic structure based on documentation)
export interface Resource {
    name: string;
    title: string;
    description: string;
}

export interface ResourcesListResult {
    resources: Resource[];
}

// Primitives: Prompts (Basic structure based on documentation)
export interface Prompt {
    name: string;
    title: string;
    description: string;
}

export interface PromptsListResult {
    prompts: Prompt[];
}
