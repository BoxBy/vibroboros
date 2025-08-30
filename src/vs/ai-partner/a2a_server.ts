import { AgentCard, Task, Message, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "./core_data_structures";

/**
 * A simple in-memory store for tasks.
 * In a production environment, this might be replaced with a database.
 */
export class InMemoryTaskStore {
    private tasks = new Map<string, Task>();

    async get(id: string): Promise<Task | undefined> {
        return this.tasks.get(id);
    }

    async set(task: Task): Promise<void> {
        this.tasks.set(task.id, task);
    }
}

/**
 * Represents the context for a request being processed by an AgentExecutor.
 */
export interface RequestContext {
    taskId: string;
    contextId: string;
    userMessage: Message;
    task?: Task; // The existing task, if any
}

/**
 * An event bus for publishing execution events during a task.
 */
export interface ExecutionEventBus {
    publish(event: Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent): void;
    finished(): void;
}

/**
 * The interface that agent logic must implement.
 */
export interface AgentExecutor {
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
    cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void>;
}

/**
 * A basic request handler that wires together the agent card, task store, and executor.
 * This is a simplified version of the DefaultRequestHandler from the A2A SDK docs.
 */
export class A2ARequestHandler {
    constructor(
        public readonly agentCard: AgentCard,
        public readonly taskStore: InMemoryTaskStore,
        public readonly agentExecutor: AgentExecutor
    ) { }

    // In a real implementation, this class would have methods to handle
    // 'sendMessage', 'getTask', etc., by calling the agentExecutor.
}
