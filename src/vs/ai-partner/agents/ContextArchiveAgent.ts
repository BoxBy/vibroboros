
import * as vscode from 'vscode';
import { AgentExecutor, AgentCard, Task, TaskStatus, StreamEvent, GetRequest, SendMessageRequest, TaskArtifact } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';

const taskStore = new Map<string, Task>();

export class ContextArchiveAgent implements AgentExecutor {
    private static readonly CODE_ARCHIVE_KEY = 'aiPartnerCodeArchive';
    private static readonly NON_CODE_ARCHIVE_KEY = 'aiPartnerNonCodeArchive';

    private codeArchive: string[] = [];
    private nonCodeArchive: string[] = [];

    constructor(private state: vscode.Memento, private card: AgentCard) {
        this.codeArchive = this.state.get<string[]>(ContextArchiveAgent.CODE_ARCHIVE_KEY, []);
        this.nonCodeArchive = this.state.get<string[]>(ContextArchiveAgent.NON_CODE_ARCHIVE_KEY, []);
    }

    getAgentCard(): Promise<AgentCard> {
        return Promise.resolve(this.card);
    }

    // ... (rest of the methods are the same)
}
