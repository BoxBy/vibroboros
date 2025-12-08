import { AgentCard } from "@a2a-js/sdk";
import { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
export declare class SecurityAnalysisAgent implements AgentExecutor {
    private card;
    private mcpClient;
    constructor(card: AgentCard);
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
    cancelTask(): Promise<void>;
}
