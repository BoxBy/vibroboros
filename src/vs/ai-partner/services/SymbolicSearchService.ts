/**
 * SymbolicSearchService
 * AST-based symbol extraction using web-tree-sitter.
 *
 * Concept inspired by:
 * - cgrep: https://github.com/meghendra6/cgrep (MIT License)
 * - Mantic.sh: https://github.com/marcoaapfortes/Mantic.sh (AGPL-3.0)
 * - mgrep: https://github.com/mixedbread-ai/mgrep (Apache-2.0)
 * - Serena: https://github.com/oraios/serena (MIT License)
 *
 * This implementation is written independently from scratch on top of
 * `web-tree-sitter` (MIT License). No source code has been copied.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as TreeSitter from 'web-tree-sitter';
import { ISymbolicSearchService } from '../di/interfaces/ISymbolicSearchService';

/**
 * Symbolic Search Service using web-tree-sitter
 */
export class SymbolicSearchService implements ISymbolicSearchService {
    private static instance: SymbolicSearchService;
    private static readonly HANDLED_TYPES = new Set([
        'function_declaration',
        'class_declaration',
        'method_definition',
        'interface_declaration',
        'type_alias_declaration',
        'abstract_class_declaration',
    ]);
    private parser: TreeSitter.Parser | null = null;
    private languages: Map<string, TreeSitter.Language> = new Map();
    private isInitialized = false;

    private constructor() {}

    private get workspaceRoot(): string {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }

    public static getInstance(): SymbolicSearchService {
        if (!SymbolicSearchService.instance) {
            SymbolicSearchService.instance = new SymbolicSearchService();
        }
        return SymbolicSearchService.instance;
    }

    /**
     * Initialize the tree-sitter engine and load languages
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) { return; }

        try {
            await (TreeSitter.Parser as any).init();
            this.parser = new TreeSitter.Parser();
            // Mark initialized as soon as parser is ready — languages can be absent (WASM files optional)
            this.isInitialized = true;

            const wasmPath = path.join(__dirname, '..', '..', '..', '..', 'resources', 'wasm');
            await this.loadLanguage('typescript', path.join(wasmPath, 'tree-sitter-typescript.wasm'));
            await this.loadLanguage('javascript', path.join(wasmPath, 'tree-sitter-javascript.wasm'));

            if (this.languages.size === 0) {
                console.warn('[SymbolicSearchService] No tree-sitter languages loaded. AST parsing will use VS Code fallback.');
            } else {
                console.log(`[SymbolicSearchService] Initialized with ${this.languages.size} language(s).`);
            }
        } catch (error) {
            console.error('[SymbolicSearchService] Failed to initialize tree-sitter parser:', error);
            throw error;
        }
    }

    private async loadLanguage(langId: string, wasmFilePath: string): Promise<void> {
        try {
            const lang = await TreeSitter.Language.load(wasmFilePath);
            this.languages.set(langId, lang);
        } catch (error: any) {
            console.warn(`[SymbolicSearchService] Could not load language ${langId} from ${wasmFilePath}`);
        }
    }

    public async getSymbols(filePath: string): Promise<vscode.SymbolInformation[]> {
        if (!this.isInitialized) { await this.initialize(); }
        if (!this.parser) { return []; }

        try {
            const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workspaceRoot, filePath);
            const content = await fs.readFile(fullPath, 'utf-8');
            const ext = path.extname(filePath).toLowerCase();
            
            let langId = 'typescript';
            if (ext === '.js' || ext === '.jsx') { langId = 'javascript'; }
            
            const lang = this.languages.get(langId);
            if (!lang) {
                console.warn(`[SymbolicSearchService] No tree-sitter language loaded for ${langId}`);
                // Fallback to VS Code built-in symbols if possible
                return await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                    'vscode.executeDocumentSymbolProvider',
                    vscode.Uri.file(fullPath)
                ) || [];
            }

            this.parser.setLanguage(lang);
            const tree = this.parser.parse(content);
            if (!tree) { return []; }
            
            // Traversal and extraction (simplified for now)
            const symbols: vscode.SymbolInformation[] = [];
            this.extractSymbols(tree.rootNode, symbols, filePath);
            
            return symbols;
        } catch (error) {
            console.error(`[SymbolicSearchService] Error getting symbols for ${filePath}:`, error);
            return [];
        }
    }

    private extractSymbols(node: TreeSitter.Node, symbols: vscode.SymbolInformation[], filePath: string) {
        const nodeType = node.type;

        if (SymbolicSearchService.HANDLED_TYPES.has(nodeType)) {
            const nameNode = node.childForFieldName('name') || node.firstNamedChild;
            if (nameNode) {
                const range = new vscode.Range(
                    node.startPosition.row, node.startPosition.column,
                    node.endPosition.row, node.endPosition.column
                );
                symbols.push(new vscode.SymbolInformation(
                    nameNode.text,
                    this.mapNodeTypeToKind(nodeType),
                    '',
                    new vscode.Location(vscode.Uri.file(filePath), range)
                ));
            }
        }

        // Handle arrow functions assigned to variables: `const foo = () => {}`
        if (nodeType === 'lexical_declaration' || nodeType === 'variable_declaration') {
            for (const child of node.children) {
                if (child.type === 'variable_declarator') {
                    const nameNode = child.childForFieldName('name');
                    const valueNode = child.childForFieldName('value');
                    if (nameNode && valueNode && (valueNode.type === 'arrow_function' || valueNode.type === 'function')) {
                        const range = new vscode.Range(
                            node.startPosition.row, node.startPosition.column,
                            node.endPosition.row, node.endPosition.column
                        );
                        symbols.push(new vscode.SymbolInformation(
                            nameNode.text,
                            vscode.SymbolKind.Function,
                            '',
                            new vscode.Location(vscode.Uri.file(filePath), range)
                        ));
                    }
                }
            }
        }

        for (const child of node.children) {
            this.extractSymbols(child, symbols, filePath);
        }
    }

    private mapNodeTypeToKind(type: string): vscode.SymbolKind {
        switch (type) {
            case 'class_declaration':
            case 'abstract_class_declaration': return vscode.SymbolKind.Class;
            case 'function_declaration': return vscode.SymbolKind.Function;
            case 'method_definition': return vscode.SymbolKind.Method;
            case 'interface_declaration': return vscode.SymbolKind.Interface;
            case 'type_alias_declaration': return vscode.SymbolKind.TypeParameter;
            default: return vscode.SymbolKind.Variable;
        }
    }

    public async findSymbol(query: string, options?: { filePath?: string }): Promise<vscode.SymbolInformation[]> {
        // If filePath is provided, search only there. Otherwise, we might need a workspace-wide index.
        // For Phase 3, we focus on targeted search.
        if (options?.filePath) {
            const symbols = await this.getSymbols(options.filePath);
            return symbols.filter(s => s.name.toLowerCase().includes(query.toLowerCase()));
        }
        
        // Workspace-wide fallback via VS Code API
        return await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeWorkspaceSymbolProvider',
            query
        ) || [];
    }

    /**
     * [Phase 3] Extract specific function bounds (start-end lines)
     */
    public async getSymbolRange(filePath: string, symbolName: string): Promise<{ startLine: number; endLine: number } | null> {
        const symbols = await this.getSymbols(filePath);
        const symbol = symbols.find(s => s.name === symbolName || s.name.includes(symbolName));
        
        if (symbol) {
            return {
                startLine: symbol.location.range.start.line + 1, // 1-indexed for the agent
                endLine: symbol.location.range.end.line + 1
            };
        }
        return null;
    }

    /**
     * Extract import module paths from a file using AST parsing.
     * Walks top-level `import_statement` nodes and reads the `source` field.
     */
    public async getImports(filePath: string): Promise<string[]> {
        if (!this.isInitialized) { await this.initialize(); }
        if (!this.parser) { return []; }

        try {
            const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workspaceRoot, filePath);
            const content = await fs.readFile(fullPath, 'utf-8');
            const ext = path.extname(filePath).toLowerCase();

            let langId = 'typescript';
            if (ext === '.js' || ext === '.jsx') { langId = 'javascript'; }

            const lang = this.languages.get(langId);
            if (!lang) { return []; }

            this.parser.setLanguage(lang);
            const tree = this.parser.parse(content);
            if (!tree) { return []; }

            const imports: string[] = [];
            for (const child of tree.rootNode.children) {
                // tree-sitter-typescript: import_statement
                // tree-sitter-javascript: import_statement
                if (child.type === 'import_statement') {
                    const source = child.childForFieldName('source');
                    if (source) {
                        imports.push(source.text.replace(/['"]/g, ''));
                    }
                }
            }
            return imports;
        } catch (error) {
            console.error(`[SymbolicSearchService] Error getting imports for ${filePath}:`, error);
            return [];
        }
    }

    /**
     * [Phase 3] Top 3 files → tree-sitter function bounds pipeline.
     * Accepts an array of file paths (e.g. reranker Top-3 output) and returns
     * all symbol boundaries per file, enabling the agent to read only the
     * relevant function instead of the entire file.
     *
     * @param filePaths   Array of file paths to extract symbol bounds from.
     * @param symbolQuery Optional: filter to symbols whose name matches this substring.
     */
    public async getSymbolBoundsForFiles(
        filePaths: string[],
        symbolQuery?: string
    ): Promise<Array<{ filePath: string; symbols: Array<{ name: string; kind: string; startLine: number; endLine: number }> }>> {
        const results: Array<{ filePath: string; symbols: Array<{ name: string; kind: string; startLine: number; endLine: number }> }> = [];

        for (const filePath of filePaths) {
            try {
                const vscodeSymbols = await this.getSymbols(filePath);
                let filtered = vscodeSymbols;

                if (symbolQuery) {
                    const q = symbolQuery.toLowerCase();
                    filtered = filtered.filter(s => s.name.toLowerCase().includes(q));
                }

                results.push({
                    filePath,
                    symbols: filtered.map(s => ({
                        name: s.name,
                        kind: s.kind.toString(),
                        startLine: s.location.range.start.line + 1, // 1-indexed for agent consumption
                        endLine: s.location.range.end.line + 1
                    }))
                });
            } catch (error) {
                console.error(`[SymbolicSearchService] getSymbolBoundsForFiles: error on ${filePath}:`, error);
                results.push({ filePath, symbols: [] });
            }
        }

        return results;
    }
}
