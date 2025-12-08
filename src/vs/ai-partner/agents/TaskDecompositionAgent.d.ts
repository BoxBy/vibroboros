import { AgentExecutor, AgentCard, RequestContext, ExecutionEventBus } from "@a2a-js/sdk";
export declare class TaskDecompositionAgent implements AgentExecutor {
    private card;
    private llmService;
    private configService;
    constructor(card: AgentCard);
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
}
