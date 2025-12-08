import type { AgentCard } from "@a2a-js/sdk";
import { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import * as vscode from 'vscode';
export declare class BrainstormAgent implements AgentExecutor {
    private card;
    private state;
    private llmService;
    private configService;
    private mcpClient;
    constructor(card: AgentCard, state: vscode.Memento);
    cancelTask(): Promise<void>;
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
    private finalizePlan;
}
