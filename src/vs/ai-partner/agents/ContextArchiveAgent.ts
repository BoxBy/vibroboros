import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';

export class ContextArchiveAgent {
    private static readonly AGENT_ID = 'ContextArchiveAgent';
    private static readonly CODE_ARCHIVE_KEY = 'aiPartnerCodeArchive';
    private static readonly NON_CODE_ARCHIVE_KEY = 'aiPartnerNonCodeArchive';

    private codeArchive: string[] = [];
    private nonCodeArchive: string[] = [];
    private dispatch: (message: A2AMessage<any>) => Promise<void>;
    private state: vscode.Memento;

    constructor(
        dispatch: (message: A2AMessage<any>) => Promise<void>,
        state: vscode.Memento
    ) {
        this.dispatch = dispatch;
        this.state = state;
        this.codeArchive = this.state.get<string[]>(ContextArchiveAgent.CODE_ARCHIVE_KEY, []);
        this.nonCodeArchive = this.state.get<string[]>(ContextArchiveAgent.NON_CODE_ARCHIVE_KEY, []);
    }

    public async handleA2AMessage(message: A2AMessage<any>): Promise<void> {
        switch (message.type) {
            case 'archiveContext':
                this.archiveContext(message.payload.content);
                break;
            case 'searchArchivedContext':
                this.searchArchivedContext(message.payload.query);
                break;
        }
    }

    private async archiveContext(content: string): Promise<void> {
        // Use markdown code fences to determine if the content is code
        if (content.includes('```')) {
            this.codeArchive.push(content);
            await this.state.update(ContextArchiveAgent.CODE_ARCHIVE_KEY, this.codeArchive);
        } else {
            this.nonCodeArchive.push(content);
            await this.state.update(ContextArchiveAgent.NON_CODE_ARCHIVE_KEY, this.nonCodeArchive);
        }
    }

    private searchArchivedContext(query: string): void {
        const queryLower = query.toLowerCase();
        let results: string[] = [];

        // Search non-code archive first
        results = this.nonCodeArchive.filter(item => item.toLowerCase().includes(queryLower));

        // If no results in non-code, and query suggests code, search code archive
        if (results.length === 0) {
            const codeKeywords = ['code', 'function', 'method', 'class', 'snippet'];
            if (codeKeywords.some(kw => queryLower.includes(kw))) {
                results = this.codeArchive.filter(item => item.toLowerCase().includes(queryLower));
            }
        }

        // For simplicity, we'll just return the first 5 matches.
        const foundInfo = results.slice(0, 5).join('\n---\n');

        if (foundInfo) {
            this.dispatch({
                sender: ContextArchiveAgent.AGENT_ID,
                recipient: 'OrchestratorAgent',
                timestamp: new Date().toISOString(),
                type: 'response-archived-context',
                payload: { retrievedInfo: foundInfo }
            });
        }
    }
}
