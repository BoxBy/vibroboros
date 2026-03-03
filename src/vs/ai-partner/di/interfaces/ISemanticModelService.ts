/**
 * Interface for Semantic Model Service
 * Manages semantic code graph and code symbols
 */

export interface CodeSymbol {
    id: string;
    name: string;
    kind: string;
    filePath: string;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    metadata?: { [key: string]: any };
}

export interface Relation {
    from: string;
    to: string;
    type: 'calls' | 'imports' | 'implements' | 'extends' | 'uses';
}

export interface SemanticGraph {
    symbols: Map<string, CodeSymbol>;
    relations: Relation[];
}

export interface ISemanticModelService {
    /**
     * Get code symbols for a file
     */
    getSymbolsForFile(filePath: string): Promise<CodeSymbol[]>;

    /**
     * Find symbols by name
     */
    findSymbolsByName(name: string): CodeSymbol[];

    /**
     * Get relations for a symbol
     */
    getRelations(symbolId: string): Relation[];

    /**
     * Get the full semantic graph
     */
    getGraph(): SemanticGraph;

    /**
     * Update the graph for a file
     */
    updateGraph(filePath: string): Promise<void>;

    /**
     * Get a simplified directory structure string
     */
    getDirectoryStructureOnly(): string;

    /**
     * Get context relevant to a specific file and related files
     */
    getSmartContext(activeFilePath?: string, explicitRelatedFiles?: string[]): string;

    /**
     * Get general context for a query
     */
    getContextForQuery(query: string): string;
}
