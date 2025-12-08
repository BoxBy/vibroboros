import * as vscode from 'vscode';
import { AgentCard } from "@a2a-js/sdk";
import { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
export declare class CodeAnalysisAgent implements AgentExecutor {
    private card;
    private state;
    private static readonly INDEX_KEY;
    private isIndexing;
    private llmService;
    private configService;
    constructor(card: AgentCard, state: vscode.Memento);
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
    private analyzeCode;
    private searchIndex;
    private buildInitialIndex;
    private updateIndexForFile;
    private parseFileForSymbols;
}
