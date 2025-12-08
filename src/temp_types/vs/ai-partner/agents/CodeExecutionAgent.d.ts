import { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { AgentCard } from "@a2a-js/sdk";
import { DeveloperLogService } from "../services/DeveloperLogService";
export declare class CodeExecutionAgent implements AgentExecutor {
    private card;
    private llmService;
    private configService;
    private devLogService;
    constructor(card: AgentCard, devLogService: DeveloperLogService);
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
    cancelTask(): Promise<void>;
}
