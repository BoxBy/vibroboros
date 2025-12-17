import * as vscode from 'vscode';
import { SemanticModelService } from "../services/SemanticModelService";

export interface SemanticGraphToolInput {
    query: string;
    type: 'search' | 'file-related' | 'symbol-lookup';
}

export interface ToolResult {
    text?: string;
    error?: boolean;
}

export class SemanticGraphTool {
    public readonly name = 'querySemanticGraph';
    public readonly description = 'Queries the semantic graph for symbol information. Use this to find where classes/functions are defined, their signatures, and PRECISE line ranges (start/end) across any language (Python, TS, Go, etc.). Prefer this over regex-search for code navigation.';
    public readonly inputSchema = {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'The search term (symbol name, filename, or keyword)' },
            type: { 
                type: 'string', 
                enum: ['search', 'file-related', 'symbol-lookup'], 
                description: 'Type of query. "symbol-lookup" is best for finding definitions.' 
            }
        },
        required: ['query', 'type']
    };

    private semanticService: SemanticModelService;

    constructor() {
        this.semanticService = SemanticModelService.getInstance();
    }

    async execute(input: SemanticGraphToolInput): Promise<ToolResult> {
        try {
            const { query, type } = input;
            
            // 1. Logic for Symbol Lookup (Enhanced with LSP)
            if (type === 'symbol-lookup') {
                return await this.handleSymbolLookup(query);
            }

            // 2. Fallback to Standard Regex-based Service for other types
            const result = this.semanticService.queryGraph(query, type);
            return {
                text: result
            };

        } catch (error: any) {
            return {
                text: `Error querying semantic graph: ${error.message}`,
                error: true
            };
        }
    }

    private async handleSymbolLookup(query: string): Promise<ToolResult> {
        // Step A: Use Global Index to find candidate files
        // We assume the regex-index is "good enough" to find the file candidates.
        const rawResult = this.semanticService.queryGraph(query, 'symbol-lookup');
        if (rawResult.startsWith('No results') || rawResult.startsWith('Error') || rawResult.startsWith('⚠️')) {
             return { text: rawResult };
        }

        let candidates: any[] = [];
        try {
            candidates = JSON.parse(rawResult);
        } catch {
            return { text: rawResult };
        }

        // Step B: Refine candidates using LSP (vscode.executeDocumentSymbolProvider)
        // This gives us precise ranges (endLine) which the regex index might lack or guess incorrecty.
        const refinedResults: any[] = [];

        for (const candidate of candidates) {
            try {
                const uri = vscode.Uri.file(candidate.file);
                // We must open the doc to run LSP (or at least have it available)
                // vscode.workspace.openTextDocument might be needed if not open, but 'executeDocumentSymbolProvider' expects an open-ish URI.
                // Actually, executeDocumentSymbolProvider takes a URI. VS Code handles the rest (might need to open internally).
                
                // Retry strict symbol search via LSP
                // NOTE: This can be slow if many candidates. Limit to top 5.
                if (refinedResults.length >= 5) break;

                const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                    'vscode.executeDocumentSymbolProvider', 
                    uri
                );

                if (symbols) {
                    const matched = this.findSymbolInTree(symbols, candidate.name);
                    if (matched) {
                        refinedResults.push({
                            name: matched.name,
                            kind: vscode.SymbolKind[matched.kind],
                            file: candidate.file,
                            range: {
                                startLine: matched.range.start.line + 1, // 1-based for users
                                endLine: matched.range.end.line + 1
                            },
                            // Docstring/detail often in 'detail' or 'children'
                            detail: matched.detail
                        });
                        continue; // Found valid LSP match, move to next file
                    }
                }
                
                // Fallback: If LSP failed or didn't match, keep regex result
                refinedResults.push(candidate);

            } catch (e) {
                // LSP failure, ignore and keep regex candidate
                refinedResults.push(candidate);
            }
        }

        if (refinedResults.length === 0) {
            return { text: "No symbols found after refinement." };
        }

        return {
            text: JSON.stringify(refinedResults, null, 2)
        };
    }

    private findSymbolInTree(symbols: vscode.DocumentSymbol[], targetName: string): vscode.DocumentSymbol | undefined {
        for (const sym of symbols) {
            if (sym.name === targetName) {
                return sym;
            }
            if (sym.children && sym.children.length > 0) {
                const found = this.findSymbolInTree(sym.children, targetName);
                if (found) return found;
            }
        }
        return undefined;
    }
}
