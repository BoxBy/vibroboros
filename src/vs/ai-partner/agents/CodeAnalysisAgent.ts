import * as vscode from 'vscode';

// From original implementation
interface CodeSymbol {
    name: string;
    type: 'function' | 'class' | 'interface' | 'type' | 'method' | 'property';
    line: number;
    children?: CodeSymbol[];
}

interface FileIndex {
    symbols: CodeSymbol[];
}

interface StreamEvent {
    type: string;
    message: string;
}

export class CodeAnalysisAgent {
    private static readonly INDEX_KEY = 'aiPartnerCodebaseIndex';
    private isIndexing: boolean = false;

    constructor(private state: vscode.Memento) {}

    public searchIndex(symbolName: string, stream: (event: StreamEvent) => void): any[] {
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

    public async buildInitialIndex(stream: (event: StreamEvent) => void): Promise<void> {
        if (this.isIndexing) {
            stream({ type: 'log', message: 'Indexing is already in progress.' });
            return;
        }
        this.isIndexing = true;
        try {
            const files = await vscode.workspace.findFiles('**/*.{ts,js,tsx,jsx,py,java,go,rb}', '**/node_modules/**');
            const newIndex: Record<string, FileIndex> = {};
            stream({ type: 'log', message: `Found ${files.length} files to index.` });

            for (const file of files) {
                try {
                    const content = await vscode.workspace.fs.readFile(file);
                    const symbols = this.parseFileForSymbols(new TextDecoder().decode(content));
                    if (symbols.length > 0) {
                        newIndex[file.fsPath] = { symbols };
                    }
                } catch (e: any) {
                    stream({ type: 'log', message: `Failed to read or parse file: ${file.fsPath} - ${e.message}` });
                }
            }

            await this.state.update(CodeAnalysisAgent.INDEX_KEY, newIndex);
            stream({ type: 'log', message: `Initial indexing complete. ${Object.keys(newIndex).length} files indexed.` });

        } catch (error: any) {
            stream({ type: 'log', message: `Error during initial indexing: ${error.message}` });
        } finally {
            this.isIndexing = false;
        }
    }

    public async updateIndexForFile(filePath: string, stream: (event: StreamEvent) => void): Promise<void> {
        try {
            const fullIndex = this.state.get<Record<string, FileIndex>>(CodeAnalysisAgent.INDEX_KEY, {});
            const uri = vscode.Uri.file(filePath);
            const content = await vscode.workspace.fs.readFile(uri);
            const symbols = this.parseFileForSymbols(new TextDecoder().decode(content));

            if (symbols.length > 0) {
                fullIndex[filePath] = { symbols };
            } else {
                delete fullIndex[filePath];
            }

            await this.state.update(CodeAnalysisAgent.INDEX_KEY, fullIndex);
            stream({ type: 'log', message: `Re-indexed file: ${filePath}` });
        } catch (e: any) {
            stream({ type: 'log', message: `Failed to re-index file: ${filePath} - ${e.message}` });
        }
    }

    private parseFileForSymbols(content: string): CodeSymbol[] {
        const lines = content.split('\n');
        const symbols: CodeSymbol[] = [];
        const symbolRegex = /^(?:\s*(?:export|public|private|protected|async|static)*\s+)?(class|interface|type|function|def)\s+([\w\d_]+)/;
        const methodRegex = /^(?:\s*(?:export|public|private|protected|async|static)*\s+)?([\w\d_]+)\s*\(.*\)\s*[:{]/;

        lines.forEach((line, index) => {
            const trimmedLine = line.trim();
            let match;

            match = trimmedLine.match(symbolRegex);
            if (match) {
                const symbol: CodeSymbol = {
                    name: match[2],
                    type: match[1] === 'def' ? 'function' : match[1] as any,
                    line: index + 1,
                    children: []
                };
                symbols.push(symbol);
                return;
            }

            if (line.match(/^\s+/) && !trimmedLine.startsWith('//') && !trimmedLine.startsWith('*')) {
                 match = trimmedLine.match(methodRegex);
                 if(match) {
                    const methodName = match[1];
                    if (methodName !== 'constructor' && methodName !== 'if' && methodName !== 'for' && methodName !== 'while') {
                        const methodSymbol: CodeSymbol = {
                            name: methodName,
                            type: 'method',
                            line: index + 1
                        };
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