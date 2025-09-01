import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';

// Represents a symbol in the code, can be nested.
interface CodeSymbol {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'method' | 'property';
  line: number;
  children?: CodeSymbol[];
}

// Represents the index for a single file.
interface FileIndex {
  symbols: CodeSymbol[];
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
    private isIndexing: boolean = false;

    constructor(dispatch: (message: A2AMessage<any>) => void, state: vscode.Memento) {
        this.dispatch = dispatch;
        this.state = state;
    }

    public async handleA2AMessage(message: A2AMessage<any>): Promise<void> {
        switch (message.type) {
            case 'request-initial-index':
                if (this.isIndexing) {
                    console.log(`[${CodeAnalysisAgent.AGENT_ID}] Indexing is already in progress.`);
                    return;
                }
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
                    recipient: message.sender, // Should be OrchestratorAgent
                    timestamp: new Date().toISOString(),
                    type: 'response-codebase-search',
                    payload: { results: searchResults }
                });
                break;
        }
    }

    private searchIndex(symbolName: string): any[] {
        const fullIndex = this.state.get<Record<string, FileIndex>>(CodeAnalysisAgent.INDEX_KEY, {});
        const results: any[] = [];

        const recursiveSearch = (symbols: CodeSymbol[], filePath: string) => {
            for (const symbol of symbols) {
                if (symbol.name.toLowerCase().includes(symbolName.toLowerCase())) {
                    results.push({ filePath, symbol });
                }
                if (symbol.children) {
                    recursiveSearch(symbol.children, filePath);
                }
            }
        };

        for (const filePath in fullIndex) {
            recursiveSearch(fullIndex[filePath].symbols, filePath);
        }
        return results;
    }

    private async buildInitialIndex(): Promise<void> {
        this.isIndexing = true;
        try {
            const files = await vscode.workspace.findFiles('**/*.{ts,js,tsx,jsx,py,java,go,rb}', '**/node_modules/**');
            const newIndex: Record<string, FileIndex> = {};

            for (const file of files) {
                try {
                    const content = await vscode.workspace.fs.readFile(file);
                    const symbols = this.parseFileForSymbols(new TextDecoder().decode(content));
                    if (symbols.length > 0) {
                        newIndex[file.fsPath] = { symbols };
                    }
                } catch (e) {
                    console.error(`[${CodeAnalysisAgent.AGENT_ID}] Failed to read or parse file: ${file.fsPath}`, e);
                }
            }

            await this.state.update(CodeAnalysisAgent.INDEX_KEY, newIndex);
            console.log(`[${CodeAnalysisAgent.AGENT_ID}] Initial indexing complete. ${Object.keys(newIndex).length} files indexed.`);

        } catch (error) {
            console.error(`[${CodeAnalysisAgent.AGENT_ID}] Error during initial indexing:`, error);
        } finally {
            this.isIndexing = false;
        }
    }

    private async updateIndexForFile(filePath: string): Promise<void> {
        try {
            const fullIndex = this.state.get<Record<string, FileIndex>>(CodeAnalysisAgent.INDEX_KEY, {});
            const uri = vscode.Uri.file(filePath);
            const content = await vscode.workspace.fs.readFile(uri);
            const symbols = this.parseFileForSymbols(new TextDecoder().decode(content));

            if (symbols.length > 0) {
                fullIndex[filePath] = { symbols };
            } else {
                delete fullIndex[filePath]; // Remove file from index if it has no symbols
            }

            await this.state.update(CodeAnalysisAgent.INDEX_KEY, fullIndex);
            console.log(`[${CodeAnalysisAgent.AGENT_ID}] Re-indexed file: ${filePath}`);
        } catch (e) {
            console.error(`[${CodeAnalysisAgent.AGENT_ID}] Failed to re-index file: ${filePath}`, e);
        }
    }

    private parseFileForSymbols(content: string): CodeSymbol[] {
        const lines = content.split('\n');
        const symbols: CodeSymbol[] = [];
        const parentStack: CodeSymbol[] = [];

        // Very basic regex for identifying classes, functions, and methods.
        // This is not a full AST parser and has limitations.
        const symbolRegex = /^(?:\s*(?:export|public|private|protected|async|static)*\s+)?(class|interface|type|function|def)\s+([\w\d_]+)/;
        const methodRegex = /^(?:\s*(?:export|public|private|protected|async|static)*\s+)?([\w\d_]+)\s*\(.*\)\s*[:{]/;

        lines.forEach((line, index) => {
            const trimmedLine = line.trim();
            let match;

            // Check for top-level symbols
            match = trimmedLine.match(symbolRegex);
            if (match) {
                const symbol: CodeSymbol = {
                    name: match[2],
                    type: match[1] === 'def' ? 'function' : match[1] as any,
                    line: index + 1,
                    children: []
                };
                symbols.push(symbol);
                return; // Continue to next line
            }

            // A simplified check for methods inside a potential class body
            // This logic is basic and assumes methods are indented.
            if (line.match(/^\s+/) && !trimmedLine.startsWith('//') && !trimmedLine.startsWith('*')) {
                 match = trimmedLine.match(methodRegex);
                 if(match) {
                    const methodName = match[1];
                    // Avoid matching constructors or keywords as method names
                    if (methodName !== 'constructor' && methodName !== 'if' && methodName !== 'for' && methodName !== 'while') {
                        const methodSymbol: CodeSymbol = {
                            name: methodName,
                            type: 'method',
                            line: index + 1
                        };
                        // Try to add to the last found class/interface if possible
                        const lastSymbol = symbols[symbols.length - 1];
                        if(lastSymbol && (lastSymbol.type === 'class' || lastSymbol.type === 'interface')) {
                            lastSymbol.children?.push(methodSymbol);
                        }
                    }
                 }
            }
        });

        return symbols;
    }
}
