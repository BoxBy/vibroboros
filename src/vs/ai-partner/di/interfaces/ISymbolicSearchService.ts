import { SymbolInformation } from 'vscode';

/**
 * Interface for Symbolic Search Service
 * Provides tree-sitter based symbol detection and location
 */
export interface ISymbolicSearchService {
    /**
     * Search for symbols in a file
     */
    getSymbols(filePath: string): Promise<SymbolInformation[]>;

    /**
     * Find specific symbol definition
     */
    findSymbol(query: string, options?: { filePath?: string }): Promise<SymbolInformation[]>;

    /**
     * Initialize the tree-sitter engine
     */
    initialize(): Promise<void>;

    /**
     * Get the range (start/end lines) for a symbol by name
     */
    getSymbolRange(filePath: string, symbolName: string): Promise<{ startLine: number; endLine: number } | null>;

    /**
     * [Phase 3] Pipe an array of file paths (e.g. Top 3 from semantic search) through the
     * tree-sitter AST engine and return all function/class boundaries per file.
     * This is the core PLAN.md Phase 3 pipeline step: Top 3 files → symbol bounds.
     */
    getSymbolBoundsForFiles(
        filePaths: string[],
        symbolQuery?: string
    ): Promise<Array<{ filePath: string; symbols: Array<{ name: string; kind: string; startLine: number; endLine: number }> }>>;
}
