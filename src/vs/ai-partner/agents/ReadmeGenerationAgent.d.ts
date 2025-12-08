import { AgentExecutor, AgentCard, RequestContext, ExecutionEventBus } from "@a2a-js/sdk";
export declare class ReadmeGenerationAgent implements AgentExecutor {
    private card;
    private llmService;
    private configService;
    private mcpClient;
    constructor(card: AgentCard);
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
    private _readFileWithTool;
    private _writeFileWithTool;
}
