# Folder: src/vs/ai-partner/interfaces

## Role
This directory defines the TypeScript interfaces for the data structures and message payloads used for communication throughout the AI Partner system. It acts as the "data contract" between different components, such as agents, services, and UI.

## Interface Breakdown
- **`MCPMessage.ts`**: Defines the structure for messages sent via the "Master Control Program" (MCP) protocol. This is likely the primary communication channel between the main extension, agents, and the UI.
- **`A2AMessage.ts`**: Defines the structure for "Agent-to-Agent" communication. This is used when agents need to collaborate or exchange information directly.
- **`CodeData.ts`**: Defines the data structure for representing code artifacts, such as files, classes, functions, and their associated metadata. This is likely used by the `CodeAnalysisAgent` and passed to other agents.

## AI Reading Guide
- Before attempting to send or receive messages between components, consult the interfaces in this directory to ensure the data is correctly formatted.
- If you need to add a new type of message or data payload, define its interface here first.
- Understanding `MCPMessage.ts` is crucial for understanding the main communication flow.
