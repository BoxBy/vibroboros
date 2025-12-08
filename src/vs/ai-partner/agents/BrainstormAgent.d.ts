import { AgentExecutor, AgentCard, RequestContext, ExecutionEventBus } from "@a2a-js/sdk";
import * as vscode from 'vscode';
export declare class BrainstormAgent implements AgentExecutor {
    private card;
    private state;
    private llmService;
    private configService;
    private mcpClient;
    constructor(card: AgentCard, state: vscode.Memento);
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
    private finalizePlan;
    private getInitialSystemPrompt;
}
