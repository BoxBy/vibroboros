import * as TreeSitter from 'web-tree-sitter';
import * as path from 'path';

/**
 * SemanticPruningService
 * AST-based context compression.
 * Reduces token consumption by pruning function/method bodies in peripheral files.
 */
export class SemanticPruningService {
    private static instance: SemanticPruningService;
    private parser: TreeSitter.Parser | null = null;
    private languages: Map<string, TreeSitter.Language> = new Map();
    private isInitialized = false;

    private constructor() {}

    public static getInstance(): SemanticPruningService {
        if (!SemanticPruningService.instance) {
            SemanticPruningService.instance = new SemanticPruningService();
        }
        return SemanticPruningService.instance;
    }

    public async initialize(): Promise<void> {
        if (this.isInitialized) { return; }

        try {
            await (TreeSitter.Parser as any).init();
            this.parser = new TreeSitter.Parser();
            
            const wasmPath = path.join(__dirname, '..', '..', '..', '..', 'resources', 'wasm');
            
            // Load available languages
            try {
                const tsLang = await TreeSitter.Language.load(path.join(wasmPath, 'tree-sitter-typescript.wasm'));
                this.languages.set('typescript', tsLang);
                this.languages.set('tsx', tsLang);
            } catch (e) {}

            try {
                const jsLang = await TreeSitter.Language.load(path.join(wasmPath, 'tree-sitter-javascript.wasm'));
                this.languages.set('javascript', jsLang);
            } catch (e) {}

            this.isInitialized = true;
        } catch (error) {
            console.error('[SemanticPruningService] Initialization failed:', error);
        }
    }

    /**
     * Prunes code by replacing long function/method bodies with placeholders.
     */
    public async prune(code: string, languageId: string, threshold: number = 5): Promise<string> {
        if (!this.isInitialized) { await this.initialize(); }
        if (!this.parser || !this.languages.has(languageId)) { return code; }

        const lang = this.languages.get(languageId)!;
        this.parser.setLanguage(lang);
        const tree = this.parser.parse(code);
        if (!tree) { return code; }

        const edits: { start: number; end: number; replacement: string }[] = [];
        this.findPrunableNodes(tree.rootNode, edits, threshold);

        // Apply edits in reverse to maintain offsets
        let prunedCode = code;
        edits.sort((a, b) => b.start - a.start);
        
        for (const edit of edits) {
            prunedCode = prunedCode.substring(0, edit.start) + edit.replacement + prunedCode.substring(edit.end);
        }

        return prunedCode;
    }

    private findPrunableNodes(node: TreeSitter.Node, edits: { start: number; end: number; replacement: string }[], threshold: number) {
        // Types of nodes that often contain "bodies" we can prune
        const bodyContainerTypes = [
            'statement_block',
            'class_body',
            'interface_body',
            'enum_body'
        ];

        if (bodyContainerTypes.includes(node.type)) {
            const lineCount = node.endPosition.row - node.startPosition.row;
            
            // If it's a statement block (function body) and it's longer than our threshold
            if (node.type === 'statement_block' && lineCount > threshold) {
                // Check parent to see if it's a function or method
                const parentType = node.parent?.type;
                if (parentType === 'function_declaration' || 
                    parentType === 'method_definition' || 
                    parentType === 'arrow_function' ||
                    parentType === 'function') {
                    
                    edits.push({
                        start: node.startIndex + 1, // Keep the opening brace {
                        end: node.endIndex - 1,     // Keep the closing brace }
                        replacement: `\n    // ... [Pruned for context: ${lineCount} lines] \n    `
                    });
                    return; // Don't recurse into pruned nodes
                }
            }
        }

        for (const child of node.children) {
            this.findPrunableNodes(child, edits, threshold);
        }
    }
}
