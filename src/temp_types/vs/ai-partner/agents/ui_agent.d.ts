import { AgentExecutor, AgentCard, RequestContext, ExecutionEventBus } from "@a2a-js/sdk";
export declare class UIAgent implements AgentExecutor {
    private card;
    constructor(card: AgentCard);
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
}
