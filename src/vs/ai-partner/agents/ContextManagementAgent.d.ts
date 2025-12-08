import { AgentExecutor, AgentCard, RequestContext, ExecutionEventBus } from "@a2a-js/sdk";
export declare class ContextManagementAgent implements AgentExecutor {
    private card;
    private codeAnalysisClient;
    private configService;
    constructor(card: AgentCard);
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
    private getFolderOverview;
}
