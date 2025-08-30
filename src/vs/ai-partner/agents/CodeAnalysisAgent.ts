import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';

interface SymbolInfo {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type';
  line: number;
}

interface FileIndex {
  symbols: SymbolInfo[];
}

/**
 * @class CodeAnalysisAgent
 * The project indexing and search engine. Builds, maintains, and searches a project-wide symbol index.
 */
export class CodeAnalysisAgent {
    private static readonly AGENT_ID = 'CodeAnalysisAgent';
    private static readonly INDEX_KEY = 'aiPartnerCodebaseIndex';

    private dispatch: (message: A2AMessage<any>) => void;
    private state: vscode.Memento;

    constructor(dispatch: (message: A2AMessage<any>) => void, state: vscode.Memento) {
        this.dispatch = dispatch;
        this.state = state;
    }

    public async handleA2AMessage(message: A2AMessage<any>): Promise<void> {
        switch (message.type) {
            case 'request-initial-index':
                console.log(`[${CodeAnalysisAgent.AGENT_ID}] Received request for initial codebase indexing.`);
                await this.buildInitialIndex();
                break;
            case 'request-reindex-file':
                console.log(`[${CodeAnalysisAgent.AGENT_ID}] Received request to re-index file:`, message.payload.filePath);
                await this.updateIndexForFile(message.payload.filePath);
                break;
            case 'request-codebase-search':
                console.log(`[${CodeAnalysisAgent.AGENT_ID}] Received search request for symbol:`, message.payload.symbolName);
                const searchResults = this.searchIndex(message.payload.symbolName);
                this.dispatch({
                    sender: CodeAnalysisAgent.AGENT_ID,
                    recipient: message.sender,
                    timestamp: new Date().toISOString(),
                    type: 'response-codebase-search',
                    payload: { results: searchResults }
                });
                break;
            case 'get-indexed-files':
                const indexedFiles = this.getIndexedFiles();
                this.dispatch({
                    sender: CodeAnalysisAgent.AGENT_ID,
                    recipient: message.sender,
                    timestamp: new Date().toISOString(),
                    type: 'response-indexed-files',
                    payload: { files: indexedFiles }
                });
                break;
        }
    }

    private getIndexedFiles(): string[] {
        const fullIndex = this.state.get<Record<string, FileIndex>>(CodeAnalysisAgent.INDEX_KEY, {});
        return Object.keys(fullIndex);
    }

    private searchIndex(symbolName: string): any[] {
        const fullIndex = this.state.get<Record<string, FileIndex>>(CodeAnalysisAgent.INDEX_KEY, {});
        const results = [];

        for (const filePath in fullIndex) {
            const fileIndex = fullIndex[filePath];
            const foundSymbols = fileIndex.symbols.filter(s => s.name === symbolName);
            if (foundSymbols.length > 0) {
                results.push({ filePath, symbols: foundSymbols });
            }
        }
        return results;
    }

    private async buildInitialIndex(): Promise<void> {
        console.log('Initial indexing is not implemented yet.');
    }

    private async updateIndexForFile(filePath: string): Promise<void> {
        console.log(`File re-indexing is not implemented yet for: ${filePath}`);
    }
}
