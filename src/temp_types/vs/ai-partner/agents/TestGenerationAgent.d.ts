import { AgentCard } from "@a2a-js/sdk";
import { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
export declare class TestGenerationAgent implements AgentExecutor {
    private card;
    private llmService;
    private configService;
    constructor(card: AgentCard);
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
    cancelTask(): Promise<void>;
    private getLanguageFromFilePath;
}
