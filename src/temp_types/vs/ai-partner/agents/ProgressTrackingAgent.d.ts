import * as vscode from 'vscode';
import { AgentCard } from "@a2a-js/sdk";
import { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
export declare class ProgressTrackingAgent implements AgentExecutor {
    private state;
    private card;
    private static readonly PLAN_STATE_KEY;
    private mcpClient;
    constructor(state: vscode.Memento, card: AgentCard);
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
    private writeProgressFile;
    cancelTask(): Promise<void>;
}
