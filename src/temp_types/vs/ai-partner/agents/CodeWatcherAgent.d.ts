import { AgentCard } from "@a2a-js/sdk";
import { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
export declare class CodeWatcherAgent implements AgentExecutor {
    private card;
    private disposables;
    private securityAgentClient;
    private codeAnalysisClient;
    private configService;
    constructor(card: AgentCard);
    private activate;
    deactivate(): void;
    private handleFileSave;
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
    cancelTask(): Promise<void>;
}
