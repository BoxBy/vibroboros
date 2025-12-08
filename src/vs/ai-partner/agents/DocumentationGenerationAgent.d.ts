import { AgentExecutor, AgentCard, RequestContext, ExecutionEventBus } from "@a2a-js/sdk";
export declare class DocumentationGenerationAgent implements AgentExecutor {
    private card;
    private llmService;
    private configService;
    private mcpClient;
    constructor(card: AgentCard);
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
    private getLanguageFromFilePath;
}
