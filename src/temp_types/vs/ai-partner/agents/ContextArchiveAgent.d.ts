import * as vscode from 'vscode';
import { AgentExecutor, AgentCard, RequestContext, ExecutionEventBus } from "@a2a-js/sdk";
export declare class ContextArchiveAgent implements AgentExecutor {
    private state;
    private card;
    private static readonly CODE_ARCHIVE_KEY;
    private static readonly NON_CODE_ARCHIVE_KEY;
    private codeArchive;
    private nonCodeArchive;
    constructor(state: vscode.Memento, card: AgentCard);
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
    private isCode;
    private archiveContext;
    private searchArchivedContext;
}
