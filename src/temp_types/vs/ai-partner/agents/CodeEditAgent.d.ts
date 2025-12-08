import { AgentCard } from "@a2a-js/sdk";
import { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
export declare class CodeEditAgent implements AgentExecutor {
    private card;
    private llmService;
    private configService;
    private mcpClient;
    constructor(card: AgentCard);
    cancelTask(): Promise<void>;
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
    private handleComment;
    private handleCreate;
    private getLanguageFromFilePath;
}
