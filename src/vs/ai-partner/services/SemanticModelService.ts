import * as vscode from 'vscode';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { DeveloperLogService } from './DeveloperLogService';
import type { ISemanticModelService, CodeSymbol, Relation, SemanticGraph } from '../di/interfaces/ISemanticModelService';

// Re-export types for backward compatibility
export type { CodeSymbol, Relation, SemanticGraph };

/**
 * SemanticModelService
 *
 * Responsibilities:
 * 1. Scans the workspace to build a Semantic Graph of code.
 * 2. Incremental updates on file save.
 * 3. Persists graph to .agent/semantic_graph.json
 * 4. Syncs human-readable summary to .agent/folder_overview.md
 *
 * Now uses dependency injection instead of singleton pattern.
 */
export class SemanticModelService implements ISemanticModelService {
    private static instance: SemanticModelService;
    private graph: SemanticGraph;
    private readonly AGENT_DIR = '.agent';
    private readonly GRAPH_FILE = 'semantic_graph.json';
    private readonly OVERVIEW_FILE = 'folder_overview.md';
    private developerLogService: DeveloperLogService;
    private statusBarItem: vscode.StatusBarItem;
    private watcher: vscode.FileSystemWatcher | undefined;
    public isIndexing: boolean = false;

    private get workspaceRoot(): string {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }

    /**
     * Constructor - uses dependency injection
     * @param developerLogService Optional developer log service (will be instantiated if not provided)
     */
    constructor(developerLogService?: DeveloperLogService) {
        this.developerLogService = developerLogService || DeveloperLogService.getInstance();
        this.graph = {
            version: 1,
            lastUpdated: new Date().toISOString(),
            files: {},
            relations: []
        };

        // Initialize Status Bar (No Icon as requested)
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.text = "Viper: Indexing...";
        this.statusBarItem.tooltip = "Semantic Graph Indexing in progress";

        this.initialize().catch(err => {
            console.error('[SemanticModel] Initialization failed:', err);
            this.developerLogService.log(`[SemanticModel] Initialization failed: ${err}`);
        });
    }

    /**
     * @deprecated Use dependency injection instead
     * This method is kept for backward compatibility during migration
     */
    public static getInstance(): SemanticModelService {
        // Note: getInstance() is deprecated — prefer DI injection.
        if (!SemanticModelService.instance) {
            SemanticModelService.instance = new SemanticModelService();
        }
        return SemanticModelService.instance;
    }

    /**
     * Internal setter for the singleton instance (used by DI container)
     * @internal
     */
    public static setInstance(instance: SemanticModelService): void {
        SemanticModelService.instance = instance;
    }

    private async initialize() {
        try {
            await this.ensureAgentDir();
            await this.loadGraph();

            // Register File Watchers for automatic updates
            this.watcher = vscode.workspace.createFileSystemWatcher('**/*');
            this.watcher.onDidCreate(uri => this.onFileCreate(uri));
            this.watcher.onDidChange(uri => {
                 // Debounce? onFileSave is usually better for 'change' content, but watcher helps for external changes
                 if (this.shouldExclude(uri.fsPath)) return;
                 vscode.workspace.openTextDocument(uri).then(doc => this.onFileSave(doc), err => {
                     // Ignore open errors (binary files, etc that slipped through)
                 });
            });
            this.watcher.onDidDelete(uri => this.onFileDelete(uri));
            
            // Initial priority scan
            await this.scanWorkspace();
        } catch (e) {
            this.developerLogService.log(`[SemanticModel] Error in initialize: ${e}`);
        }
    }

    private async ensureAgentDir() {
        const agentPath = path.join(this.workspaceRoot, this.AGENT_DIR);
        try {
            await fsPromises.mkdir(agentPath, { recursive: true });
        } catch (e) {
            // Ignore if exists
        }
    }

    /**
     * Manual refresh trigger
     */
    public async refresh() {
        this.developerLogService.log('[SemanticModel] Manual refresh triggered.');
        await this.scanWorkspace();
        vscode.window.showInformationMessage('Semantic Graph Refreshed');
    }

    /**
     * Incremental update on file save
     */
    public async onFileSave(document: vscode.TextDocument) {
        // We allow parallel update even if indexing to catch latest changes
        const filePath = document.uri.fsPath;
        if (this.shouldExclude(filePath)) {
            return;
        }

        this.developerLogService.log(`[SemanticModel] Auto-updating graph for: ${path.basename(filePath)}`);
        await this.updateFileNode(filePath);
        this.saveGraph();
        this.syncToMarkdown();
    }

    /**
     * Handle file creation
     */
    public async onFileCreate(fileUri: vscode.Uri) {
        const filePath = fileUri.fsPath;
        if (this.shouldExclude(filePath)) {
            return;
        }

        this.developerLogService.log(`[SemanticModel] Auto-updating graph for new file: ${path.basename(filePath)}`);
        await this.updateFileNode(filePath);
        this.graph.lastUpdated = new Date().toISOString();
        this.saveGraph();
        this.syncToMarkdown();
    }

    /**
     * Handle file deletion (remove from graph)
     */
    public async onFileDelete(fileUri: vscode.Uri) {
        const filePath = fileUri.fsPath;
        const relativePath = path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
        let deleted = false;
        
        // Remove exact match (file)
        if (this.graph.files[relativePath]) {
            delete this.graph.files[relativePath];
            this.developerLogService.log(`[SemanticModel] Removed deleted file: ${relativePath}`);
            deleted = true;
        }

        // Remove children if it was a directory (folder deletion)
        const prefix = relativePath + '/';
        const keysToRemove = Object.keys(this.graph.files).filter(k => k.startsWith(prefix));
        for (const k of keysToRemove) {
            delete this.graph.files[k];
            this.developerLogService.log(`[SemanticModel] Removed child file of deleted folder: ${k}`);
            deleted = true;
        }

        // Cleanup Relations: Remove all relations WHERE source is this file (or children)
        if (deleted) {
             this.graph.relations = this.graph.relations.filter(r => 
                r.sourceUri !== relativePath && 
                !r.sourceUri.startsWith(prefix)
            );
             this.graph.lastUpdated = new Date().toISOString(); 
             this.saveGraph();
             this.syncToMarkdown();
        }
    }

    /**
     * Scan the entire workspace with Priority Indexing.
     */
    public async scanWorkspace() {
        if (!this.workspaceRoot) {
            return;
        }
        
        this.isIndexing = true;
        this.statusBarItem.show();
        this.developerLogService.log('[SemanticModel] Starting workspace scan...');

        try {
            // 1. Priority Indexing: Open Documents
            const openDocs = vscode.workspace.textDocuments;
            this.developerLogService.log(`[SemanticModel] Priority Indexing: ${openDocs.length} open documents.`);
            
            const processedFiles = new Set<string>();

            for (const doc of openDocs) {
                if (doc.uri.scheme === 'file' && !this.shouldExclude(doc.uri.fsPath)) {
                    await this.updateFileNode(doc.uri.fsPath);
                    processedFiles.add(doc.uri.fsPath);
                }
            }

            // 2. Background Indexing: All files
            const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
            
            // Background processing
            let count = 0;

            for (const file of files) {
                if (processedFiles.has(file.fsPath)) {
                    continue; 
                } 
                if (this.shouldExclude(file.fsPath)) {
                    continue;
                }

                await this.updateFileNode(file.fsPath);
                count++;
            }

            this.developerLogService.log(`[SemanticModel] Scan complete. Processed ${count + processedFiles.size} files.`);
            this.graph.lastUpdated = new Date().toISOString(); 
            this.saveGraph();
            this.syncToMarkdown();

        } catch (e) {
            this.developerLogService.log(`[SemanticModel] Scan failed: ${e}`);
        } finally {
            this.isIndexing = false;
            this.statusBarItem.hide();
        }
    }

    /**
     * Analyze a single file and update the graph (Async).
     */
    public async updateFileNode(filePath: string) {
        try {
            if (this.shouldExclude(filePath)) {
                return;
            }
            const relativePath = path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');

            const content = await fsPromises.readFile(filePath, 'utf-8');

            // 1. Extract Symbols - Try Language Server first, fallback to regex
            let symbols: CodeSymbol[] = [];

            try {
                const uri = vscode.Uri.file(filePath);
                const document = await vscode.workspace.openTextDocument(uri);
                symbols = await this.extractSymbolsWithLanguageServer(document);
            } catch (e) {
                // Language Server failed, use regex fallback
                this.developerLogService.log(`[SemanticModel] Language Server failed for ${relativePath}, using regex fallback`);
            }

            // Fallback to regex if no symbols found
            if (symbols.length === 0) {
                symbols = this.extractSymbolsWithBraceMatching(content, relativePath);
            }
            
            // 2. Extract & Resolve Imports (Phase 2)
            const rawImports = this.extractImports(content, filePath);
            const resolvedRelations: Relation[] = [];
            
            for (const imp of rawImports) {
                const targetRelativePath = await this.resolveImportPath(filePath, imp);
                if (targetRelativePath) {
                    resolvedRelations.push({
                        sourceUri: relativePath,
                        targetUri: targetRelativePath,
                        type: 'import'
                    });
                }
            }

            // Update Graph Node
            this.graph.files[relativePath] = {
                checkSum: this.calculateChecksum(content),
                symbols: symbols
            };

            // Update Relations: Replace old relations for this source
            this.graph.relations = this.graph.relations.filter(r => r.sourceUri !== relativePath);
            this.graph.relations.push(...resolvedRelations);
            
            // Update timestamp
            // this.graph.lastUpdated = new Date().toISOString(); // Updated by caller usually
        } catch (error) {
            // Silent fail
        }
    }

    private shouldExclude(filePath: string): boolean {
        if (!this.workspaceRoot) return true;

        // Exclude node_modules (fast check)
        if (filePath.includes('node_modules')) {
            return true;
        }

        // Check if file is inside workspace
        const relative = path.relative(this.workspaceRoot, filePath);
        const isChild = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
        
        // On Windows, path.relative might return absolute path if different drives, 
        // or just strict check if it starts with '..'
        // We want to ensure it is INSIDE the workspace.
        if (!isChild && (relative.startsWith('..') || path.isAbsolute(relative))) {
             return true; 
        }

        // Relative path check for dot-folders
        const relativePath = relative.replace(/\\/g, '/');
        const parts = relativePath.split('/');
        if (parts.some(part => part.startsWith('.'))) {
            return true;
        }

        // Extension check
        const ext = path.extname(filePath).toLowerCase();
        const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.dylib', '.class', '.pyc'];
        if (binaryExts.includes(ext)) {
            return true;
        }

        return false;
    }

    // ... imports extraction ...
    private extractImports(content: string, filePath: string): string[] {
        const imports: string[] = [];
        // const lines = content.split('\n'); // Unused
        const ext = path.extname(filePath).toLowerCase();

        // Regex for imports
        const patterns: RegExp[] = [];
        
        // JS/TS
        if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
            patterns.push(/from\s+['"](.+?)['"]/g); // from '...'
            patterns.push(/import\s+['"](.+?)['"]/g); // import '...' (side-effect)
            patterns.push(/require\(['"](.+?)['"]\)/g); // require('...')
        }
        // Python
        else if (['.py'].includes(ext)) {
            patterns.push(/^from\s+(\S+)\s+import/gm); // from x.y import z
            patterns.push(/^import\s+(\S+)/gm); // import x
        }
        // Go
        else if (['.go'].includes(ext)) {
            patterns.push(/import\s+"(.+?)"/g);
            patterns.push(/import\s+\(\s*[^)]*\)/g); // Multi-line block (harder with single line regex, keeping simple for now)
        }
        // Java / C#
        else if (['.java', '.cs'].includes(ext)) {
            patterns.push(/^(?:import|using)\s+([a-zA-Z0-9_.]+);/gm);
        }

        // Apply patterns
        for (const p of patterns) {
            let match;
             // Reset state if global
            if (p.global) {
                p.lastIndex = 0;
            }
            
            // For multi-line generic matching, we might run on full content
            // But line-by-line is safer for large files unless regex implies multiline
            while ((match = p.exec(content)) !== null) {
                if (match[1]) {
                    imports.push(match[1]);
                }
            }
        }
        return imports;
    }

    private async resolveImportPath(sourcePath: string, importPath: string): Promise<string | null> {
        // Ignore libraries (non-relative imports usually)
        // Heuristic: relative imports start with .
        // Python might use dotted modules 'foo.bar' -> 'foo/bar.py'
        
        let targetPath = '';
        const sourceDir = path.dirname(sourcePath);

        if (importPath.startsWith('.')) {
            // Relative path: ./foo or ../bar
            targetPath = path.join(sourceDir, importPath);
        } else {
            // Absolute or Package import
            // In a workspace, "src/foo" might be valid if checking from root?
            // For now, let's assume if it doesn't start with ., it *might* be a root relative path 
            // OR a library. We try to find it in workspace.
            targetPath = path.join(this.workspaceRoot, importPath);
        }

        // Attempt to resolve extensions
        const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cs', '.go'];
        
        // 1. Exact match
        if (await this.fileExists(targetPath)) {
            return this.toWorkspaceRelative(targetPath);
        }

        // 2. Try extensions
        for (const ext of extensions) {
            if (await this.fileExists(targetPath + ext)) {
                return this.toWorkspaceRelative(targetPath + ext);
            }
        }

        // 3. Try index files (targetPath/index.ts)
        for (const ext of extensions) {
             const indexPath = path.join(targetPath, 'index' + ext);
             if (await this.fileExists(indexPath)) {
                return this.toWorkspaceRelative(indexPath);
             }
        }

        return null; // Could not resolve to a file in workspace
    }

    private async fileExists(p: string): Promise<boolean> {
        try {
            await fsPromises.access(p);
            return true;
        } catch {
            return false;
        }
    }

    private toWorkspaceRelative(absolutePath: string): string {
        return path.relative(this.workspaceRoot, absolutePath).replace(/\\/g, '/');
    }



    private calculateChecksum(content: string): string {
        const crypto = require('crypto');
        return crypto.createHash('md5').update(content).digest('hex');
    }

    private saveGraph() {
        const graphPath = path.join(this.workspaceRoot, this.AGENT_DIR, this.GRAPH_FILE);
        try {
            fs.writeFileSync(graphPath, JSON.stringify(this.graph, null, 2));
        } catch (e) {
            this.developerLogService.log(`[SemanticModel] Failed to save graph: ${e}`);
        }
    }

    private async loadGraph() {
        const graphPath = path.join(this.workspaceRoot, this.AGENT_DIR, this.GRAPH_FILE);
        if (fs.existsSync(graphPath)) {
            try {
                const loaded = JSON.parse(await fsPromises.readFile(graphPath, 'utf-8'));
                if (loaded) {
                    this.graph = loaded;
                    if (!this.graph.files) { this.graph.files = {}; }
                    if (!this.graph.relations) { this.graph.relations = []; }

                    // Sanitize: Remove files not in current workspace
                    if (this.workspaceRoot) {
                        const keys = Object.keys(this.graph.files);
                        let removed = 0;
                        keys.forEach(key => {
                             // "key" is relative path stored in graph. 
                             // If it was stored as absolute "c:/...", we need to check.
                             // But wait, updateFileNode stores `relativePath` (calculated against OLD root).
                             // If old root was "c:/", then "c:/Users/..." relative to "c:/" might be "Users/...".
                             // BUT if the user saw "**c:/**" in markdown, then the key IS "c:/..." or similar.
                             // Let's check if the key is absolute or looks like a drive path, OR
                             // if path.resolve(root, key) is valid.
                             
                             // Actually, simpler: we want keys to be relative to THIS workspace.
                             // If we changed workspaces, the relative paths might be wrong anyway.
                             // But SemanticModelService is usually one per workspace (VS Code instance).
                             // The issue is likely that "c:/..." WAS stored as the key.
                             
                             if (path.isAbsolute(key) || key.includes(':')) {
                                 delete this.graph.files[key];
                                 removed++;
                             } else {
                                // Also check reasonable relative path (no ..)
                                if (key.startsWith('..')) {
                                     delete this.graph.files[key];
                                     removed++;
                                }
                             }
                        });
                        if (removed > 0) {
                            this.developerLogService.log(`[SemanticModel] Removed ${removed} invalid/external file nodes from graph.`);
                        }
                    }
                }
            } catch (e) {
                this.developerLogService.log('[SemanticModel] Failed to load existing graph. Starting fresh.');
            }
        }
    }

    /**
     * Syncs the current graph to a human-readable Markdown summary.
     */
    /**
     * Syncs the current graph to a human-readable Markdown summary.
     * Optimized for LLM consumption: minimal headers.
     */
    public syncToMarkdown() {
        const overviewPath = path.join(this.workspaceRoot, this.AGENT_DIR, this.OVERVIEW_FILE);
        
        // Minimal Header mainly for debugging/sync check. LLM doesn't need "Project Folder Overview".
        let md = `Last Synced: ${new Date().toLocaleString()}\n\n`;

        // Group by directory
        const tree: any = {};
        Object.keys(this.graph.files).sort().forEach(filePath => {
            const parts = filePath.split('/');
            let current = tree;
            parts.forEach((part, index) => {
                if (!current[part]) {
                    current[part] = index === parts.length - 1 ? 'FILE' : {}; 
                }
                current = current[part];
            });
        });

        const renderTree = (node: any, depth: number, prefix: string) => {
            let output = '';
            const keys = Object.keys(node).sort();
            keys.forEach(key => {
                if (node[key] === 'FILE') {
                    const fileData = this.graph.files[`${prefix}${key}`];
                    const symbols = fileData?.symbols || [];
                    output += `${'  '.repeat(depth)}- **${key}**\n`;
                    
                    // Phase 3: Show Signatures in Summary
                    const important = symbols.slice(0, 10); 
                    if (important.length > 0) {
                        important.forEach(s => {
                            let sig = s.name;
                            if (s.signature) {
                                // Clean up signature for display
                                sig = s.signature.length > 80 ? s.signature.substring(0, 77) + '...' : s.signature;
                            } else if (s.kind === 'function' || s.kind === 'method') {
                                sig = `${s.name}(${s.args?.join(', ') || ''})`;
                            }
                            // Add docstring summary if available
                            const doc = s.docString ? ` - ${s.docString.split('\n')[0].substring(0, 50)}` : '';
                            output += `${'  '.repeat(depth + 1)}* \`${sig}\`${doc}\n`;
                        });
                        if (symbols.length > 10) {
                            output += `${'  '.repeat(depth + 1)}*... (${symbols.length - 10} more)*\n`;
                        }
                    }
                } else {
                    output += `${'  '.repeat(depth)}- **${key}/**\n`;
                    output += renderTree(node[key], depth + 1, `${prefix}${key}/`);
                }
            });
            return output;
        };

        md += renderTree(tree, 0, '');

        try {
            fs.writeFileSync(overviewPath, md);
        } catch(e) { /* ignore */ }
    }

    /**
     * Returns a lightweight directory tree ONLY (no symbols).
     * Ideal for Orchestrator/Router agents to save tokens.
     */
    public getDirectoryStructureOnly(): string {
        // Group by directory (Reuse logic or cached? Currently recomputing for safety)
        const tree: any = {};
        Object.keys(this.graph.files).sort().forEach(filePath => {
            const parts = filePath.split('/');
            let current = tree;
            parts.forEach((part, index) => {
                if (!current[part]) {
                    current[part] = index === parts.length - 1 ? 'FILE' : {}; 
                }
                current = current[part];
            });
        });

        const renderTreeSimple = (node: any, depth: number) => {
            let output = '';
            const keys = Object.keys(node).sort();
            keys.forEach(key => {
                if (node[key] === 'FILE') {
                    // Files: Just name
                    output += `${'  '.repeat(depth)}- **${key}**\n`;
                } else {
                    // Folders
                    output += `${'  '.repeat(depth)}- **${key}/**\n`;
                    output += renderTreeSimple(node[key], depth + 1);
                }
            });
            return output;
        };

        let md = `Last Synced: ${new Date().toLocaleString()}\n(Directory Structure Only)\n\n`;
        md += renderTreeSimple(tree, 0);
        return md;
    }

    /**
     * Returns a "Smart Context" optimized for Workers.
     * Strategy:
     * 1. ALWAYS include Directory Tree (Map).
     * 2. IF activeFile is provided, include Skeletons (Symbols) for:
     *    - The Active File itself
     *    - Its Direct Imports (1-depth)
     */
    public getSmartContext(activeFilePath?: string, explicitRelatedFiles: string[] = []): string {
        // 1. Base: Directory Tree (Lightweight)
        let md = this.getDirectoryStructureOnly();

        if ((!activeFilePath && explicitRelatedFiles.length === 0) || !this.graph.files) {
            return md;
        }

        md += `\n---\n# Targeted Context (Active & Related)\n`;

        // Helper to render a file's symbols
        const renderFileSymbols = (rPath: string, node: { symbols: CodeSymbol[] }) => {
            let out = `\n### ${rPath}\n`;
            if (node.symbols.length === 0) return out;
            
            // Sort by line number
            const sorted = [...node.symbols].sort((a, b) => a.range.startLine - b.range.startLine);
            
            sorted.forEach(s => {
                let sig = s.signature || s.name;
                // Truncate long signatures
                if (sig.length > 100) sig = sig.substring(0, 97) + '...';
                
                const doc = s.docString ? ` // ${s.docString.split('\n')[0].substring(0, 50)}` : '';
                out += `- \`${sig}\`${doc}\n`;
            });
            return out;
        };

        // 2. Active File Skeleton (Target File)
        let relativeActivePath = '';
        if (activeFilePath) {
            relativeActivePath = path.relative(this.workspaceRoot, activeFilePath).replace(/\\/g, '/');
            const activeNode = this.graph.files[relativeActivePath];
            if (activeNode) {
                md += renderFileSymbols(relativeActivePath, activeNode);
            }
        }

        // 3. Related Files (Imports + Explicit)
        const relatedSet = new Set<string>();

        // A. Add Explicit Related Files
        for (const f of explicitRelatedFiles) {
             const rel = path.isAbsolute(f) ? path.relative(this.workspaceRoot, f).replace(/\\/g, '/') : f;
             relatedSet.add(rel);
        }

        // B. Add Imports (if active file exists)
        if (relativeActivePath) {
            const imports = this.graph.relations
                .filter(r => r.sourceUri === relativeActivePath && r.type === 'import')
                .map(r => r.targetUri);
            imports.forEach(i => relatedSet.add(i));
        }
        
        // Remove active file from related set (avoid partial dup)
        if (relativeActivePath) {
            relatedSet.delete(relativeActivePath);
        }

        const uniqueRelated = Array.from(relatedSet);

        if (uniqueRelated.length > 0) {
            md += `\n#### Related Files (Imports & References)\n`;
            let importTokenCount = 0;
            const MAX_IMPORT_TOKENS = 6000; // Increased cap for explicit references

            for (const impPath of uniqueRelated) {
                const impNode = this.graph.files[impPath];
                if (impNode) {
                    const impStr = renderFileSymbols(impPath, impNode);
                    if (importTokenCount + impStr.length / 3 > MAX_IMPORT_TOKENS) {
                         md += `\n> (Remaining related files omitted to save tokens)\n`;
                         break;
                    }
                    md += impStr;
                    importTokenCount += impStr.length / 3;
                }
            }
        }

        return md;
    }

    /**
     * API for Agents to query the World Model
     */
    public getContextForQuery(_query: string): string {
        const overviewPath = path.join(this.workspaceRoot, this.AGENT_DIR, this.OVERVIEW_FILE);
        let content = "No context available.";
        if (fs.existsSync(overviewPath)) {
            content = fs.readFileSync(overviewPath, 'utf-8');
        }

        if (this.isIndexing) {
            return `⚠️ Context indexing in progress... functionality might be limited.\n\n${content}`;
        }
        return content;
    }

    /**
     * Phase 4: Smart Retrieval
     * Allows Agents to query specific parts of the graph instead of reading the whole map.
     */
    public queryGraph(query: string, type: 'search' | 'file-related' | 'symbol-lookup'): string {
        try {
            if (this.isIndexing) {
                return "⚠️ Context indexing in progress... functionality is limited. Please try again later or use grep_search.";
            }

            const results: any[] = [];
            const lowerQuery = query.toLowerCase();

            switch (type) {
                case 'search':
                    // Keyword search in file paths and symbol names
                    Object.keys(this.graph.files).forEach(filePath => {
                        const fileData = this.graph.files[filePath];
                        let matches = false;
                        
                        // Check file path
                        if (filePath.toLowerCase().includes(lowerQuery)) {
                            matches = true;
                        }
                        
                        // Check symbols
                        const matchingSymbols = fileData.symbols.filter(s => 
                            s.name.toLowerCase().includes(lowerQuery) || 
                            (s.signature && s.signature.toLowerCase().includes(lowerQuery))
                        );

                        if (matches || matchingSymbols.length > 0) {
                            results.push({
                                file: filePath,
                                matchedSymbols: matchingSymbols.map(s => s.signature || s.name)
                            });
                        }
                    });
                    break;

                case 'file-related':
                    // Get symbols + imports for a specific file
                    // Try exact match or fuzzy match
                    const targetFile = Object.keys(this.graph.files).find(f => f.toLowerCase().endsWith(lowerQuery.toLowerCase()));
                    if (!targetFile) {
                        return `No file found matching '${query}'`;
                    }

                    const data = this.graph.files[targetFile];
                    const relations = this.graph.relations.filter(r => r.sourceUri === targetFile || r.targetUri === targetFile);
                    
                    return JSON.stringify({
                        file: targetFile,
                        symbols: data.symbols.map(s => s.signature || s.name),
                        imports: relations.filter(r => r.sourceUri === targetFile).map(r => r.targetUri),
                        importedBy: relations.filter(r => r.targetUri === targetFile).map(r => r.sourceUri)
                    }, null, 2);

                case 'symbol-lookup':
                    // Detailed symbol info across codebase
                    Object.keys(this.graph.files).forEach(filePath => {
                        const fileData = this.graph.files[filePath];
                        const symbols = fileData.symbols.filter(s => s.name.toLowerCase() === lowerQuery);
                        
                        symbols.forEach(s => {
                            results.push({
                                name: s.name,
                                file: filePath,
                                signature: s.signature || s.name,
                                docString: s.docString,
                                line: s.range.startLine
                            });
                        });
                    });
                    break;
            }

            if (results.length === 0) {
                return "No results found.";
            }
            return JSON.stringify(results, null, 2);

        } catch (e: any) {
            return `Error querying graph: ${e.message}`;
        }
    }

    /**
     * Extract symbols using LSP (Language Server Protocol) for accurate line ranges
     */
    private async extractSymbolsWithLanguageServer(document: vscode.TextDocument): Promise<CodeSymbol[]> {
        const symbols: CodeSymbol[] = [];

        try {
            const documentSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );

            if (!documentSymbols) {
                return symbols;
            }

            const processSymbol = (symbol: vscode.DocumentSymbol) => {
                const codeSymbol: CodeSymbol = {
                    name: symbol.name,
                    kind: this.mapSymbolKind(symbol.kind),
                    fileUri: document.uri.fsPath,
                    range: {
                        startLine: symbol.range.start.line + 1, // Convert to 1-based
                        endLine: symbol.range.end.line + 1
                    },
                    selectionRange: {
                        startLine: symbol.selectionRange.start.line + 1,
                        endLine: symbol.selectionRange.end.line + 1
                    },
                    detail: symbol.detail || undefined
                };

                // Try to extract signature from detail or children
                if (symbol.detail) {
                    codeSymbol.signature = symbol.detail;
                    codeSymbol.docString = symbol.detail;
                }

                symbols.push(codeSymbol);

                // Process children recursively
                if (symbol.children) {
                    for (const child of symbol.children) {
                        processSymbol(child);
                    }
                }
            };

            for (const symbol of documentSymbols) {
                processSymbol(symbol);
            }

        } catch (error) {
            this.developerLogService.log(`[SemanticModel] LSP extraction failed: ${error}`);
        }

        return symbols;
    }

    /**
     * Extract symbols using brace matching for languages without LSP support
     */
    private extractSymbolsWithBraceMatching(content: string, relativePath: string): CodeSymbol[] {
        const symbols: CodeSymbol[] = [];
        const lines = content.split('\n');

        // Find class/function definitions with brace matching to calculate endLine
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Skip comments and empty lines
            if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine.startsWith('*') || trimmedLine.length === 0) {
                continue;
            }

            // Match class/interface definitions
            const classMatch = trimmedLine.match(/(?:class|interface|struct|trait|enum)\s+([a-zA-Z0-9_]+)/);
            if (classMatch) {
                const endLine = this.findMatchingBrace(lines, i);
                symbols.push({
                    name: classMatch[1],
                    kind: 'class',
                    fileUri: relativePath,
                    range: {
                        startLine: i + 1,
                        endLine: endLine + 1
                    },
                    signature: `class ${classMatch[1]}`
                });
                continue;
            }

            // Match function/method definitions
            const functionMatch = trimmedLine.match(
                /(?:export\s+)?(?:async\s+)?(?:function\s+)?([a-zA-Z0-9_]+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/
            );
            if (functionMatch && !trimmedLine.includes('class')) {
                const endLine = this.findMatchingBrace(lines, i);
                const name = functionMatch[1];
                const args = functionMatch[2];
                const returnType = functionMatch[3] ? functionMatch[3].trim() : undefined;

                symbols.push({
                    name: name,
                    kind: 'function',
                    fileUri: relativePath,
                    range: {
                        startLine: i + 1,
                        endLine: endLine + 1
                    },
                    args: args ? args.split(',').map(a => a.trim()).filter(a => a.length > 0) : [],
                    returnType: returnType,
                    signature: `${name}(${args})${returnType ? ': ' + returnType : ''}`
                });
            }

            // Match arrow functions
            const arrowMatch = trimmedLine.match(
                /(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/
            );
            if (arrowMatch) {
                const endLine = this.findMatchingBrace(lines, i);
                symbols.push({
                    name: arrowMatch[1],
                    kind: 'function',
                    fileUri: relativePath,
                    range: {
                        startLine: i + 1,
                        endLine: endLine + 1
                    },
                    args: arrowMatch[2] ? arrowMatch[2].split(',').map(a => a.trim()).filter(a => a.length > 0) : [],
                    signature: `${arrowMatch[1]}(${arrowMatch[2]})`
                });
            }

            // Match Python functions
            const pythonMatch = trimmedLine.match(/^\s*def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?:/);
            if (pythonMatch) {
                const endLine = this.findPythonBlockEnd(lines, i);
                const name = pythonMatch[1];
                const args = pythonMatch[2];
                const returnType = pythonMatch[3] ? pythonMatch[3].trim() : undefined;

                symbols.push({
                    name: name,
                    kind: 'function',
                    fileUri: relativePath,
                    range: {
                        startLine: i + 1,
                        endLine: endLine + 1
                    },
                    args: args ? args.split(',').map(a => a.trim()).filter(a => a.length > 0) : [],
                    returnType: returnType,
                    signature: `def ${name}(${args})${returnType ? ' -> ' + returnType : ''}`
                });
            }

            // Match Go functions
            const goMatch = trimmedLine.match(/^func\s+(?:\([^)]*\)\s+)?([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*(?:[^{]+)?/);
            if (goMatch) {
                const endLine = this.findMatchingBrace(lines, i);
                const name = goMatch[1];
                const args = goMatch[2];

                symbols.push({
                    name: name,
                    kind: 'function',
                    fileUri: relativePath,
                    range: {
                        startLine: i + 1,
                        endLine: endLine + 1
                    },
                    args: args ? args.split(',').map(a => a.trim()).filter(a => a.length > 0) : [],
                    signature: `func ${name}(${args})`
                });
            }
        }

        return symbols;
    }

    /**
     * Find the matching closing brace to determine the end line of a block
     */
    private findMatchingBrace(lines: string[], startLine: number): number {
        let braceCount = 0;
        let foundOpeningBrace = false;

        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i];

            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                if (char === '{') {
                    braceCount++;
                    foundOpeningBrace = true;
                } else if (char === '}') {
                    braceCount--;
                    if (braceCount === 0 && foundOpeningBrace) {
                        return i;
                    }
                }
            }
        }

        // If we can't find a matching brace, return the next line or the last line
        return Math.min(startLine + 1, lines.length - 1);
    }

    /**
     * Find the end of a Python block based on indentation
     */
    private findPythonBlockEnd(lines: string[], startLine: number): number {
        const startIndent = lines[startLine].search(/\S/);

        for (let i = startLine + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim().length === 0) {
                continue; // Skip empty lines
            }

            const indent = line.search(/\S/);
            if (indent <= startIndent) {
                return i - 1;
            }
        }

        return lines.length - 1;
    }

    /**
     * Map VS Code symbol kind to our CodeSymbol kind
     */
    private mapSymbolKind(kind: vscode.SymbolKind): 'function' | 'class' | 'method' | 'variable' | 'interface' {
        switch (kind) {
            case vscode.SymbolKind.Function:
                return 'function';
            case vscode.SymbolKind.Class:
                return 'class';
            case vscode.SymbolKind.Method:
                return 'method';
            case vscode.SymbolKind.Variable:
            case vscode.SymbolKind.Constant:
                return 'variable';
            case vscode.SymbolKind.Interface:
                return 'interface';
            default:
                return 'function';
        }
    }

    private extractSymbols(content: string, relativePath: string, _fullPath: string): CodeSymbol[] {
        const symbols: CodeSymbol[] = [];
        const lines = content.split('\n');

        // Phase 3: Enhanced Regex Patterns
        // We attempt to capture: (Declaration) (Name) (Args) (ReturnType)
        const patterns = [
            // TS/JS/C#/Java Function: public async function name(...)
            {
                regex: /((?:export|async|public|private|protected|static|void|int|string|val|var|function)\s+)+([a-zA-Z0-9_]+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/g,
                kind: 'function'
            },
            // TS/JS Arrow: const foo = (args) => ...
            {
                regex: /(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g,
                kind: 'function',
                isArrow: true
            },
            // Python: def foo(args):
            {
                regex: /^\s*def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?:/gm,
                kind: 'function',
                lang: 'python'
            },
            // Go: func foo(args) type {
            {
                regex: /^func\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*([^{]+)?/gm,
                kind: 'function',
                lang: 'go'
            },
            // Class/Struct (Generic)
            {
                regex: /(?:class|struct|interface|trait|enum)\s+([a-zA-Z0-9_]+)/g,
                kind: 'class'
            }
        ];

        // Content-based approach for multi-line regex
        // However, for simplicity and speed, we process line-by-line or small blocks.
        // The previous implementation was line-by-line which is safer for huge files but misses multi-line args.
        // For Phase 3, we stick to single-line signature assumption for performance, or small-window lookahead.

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Basic DocString Extraction (Look behind)
            let docString = undefined;
            if (i > 0) {
                const prev = lines[i-1].trim();
                // Single line doc /** ... */ or /// ... or # ...
                if (prev.startsWith('/**') && prev.endsWith('*/')) {
                    docString = prev.replace('/**', '').replace('*/', '').trim();
                } else if (prev.startsWith('///')) {
                    docString = prev.substring(3).trim();
                } else if (prev.startsWith('#')) {
                    docString = prev.substring(1).trim();
                }
            }

            for (const p of patterns) {
                // Reset standard regex
                if (p.regex.global) {
                    p.regex.lastIndex = 0;
                }

                // Simplifying: mostly standard regex against single line string
                const safeRegex = new RegExp(p.regex.source, p.regex.flags.replace('g', ''));

                const match = safeRegex.exec(line);
                if (match !== null) {
                    let name: string = '', argsStr: string = '', returnTypeStr: string | undefined = undefined, fullSig: string = '';

                    if (p.kind === 'class') {
                        name = match[1];
                        fullSig = `class ${name}`;
                    } else if (p.lang === 'python') {
                         name = match[1];
                         argsStr = match[2];
                         returnTypeStr = match[3] ? match[3].trim() : undefined;
                         fullSig = `def ${name}(${argsStr})${returnTypeStr ? ' -> ' + returnTypeStr : ''}`;
                    } else if (p.lang === 'go') {
                        name = match[1];
                        argsStr = match[2];
                        returnTypeStr = match[3] ? match[3].trim() : undefined;
                        fullSig = `func ${name}(${argsStr}) ${returnTypeStr || ''}`;
                    } else if (p.isArrow) {
                        name = match[1];
                        argsStr = match[2];
                        fullSig = `${name}(${argsStr})`;
                    } else {
                        // Standard Function (TS/Java/C#)
                        name = match[2];
                        argsStr = match[3];
                        returnTypeStr = match[4] ? match[4].trim() : undefined;
                        fullSig = `${name}(${argsStr})${returnTypeStr ? ': ' + returnTypeStr : ''}`;
                    }

                    const args = argsStr ? argsStr.split(',').map((a: string) => a.trim()).filter((a: string) => a.length > 0) : [];

                    // Calculate endLine using brace matching for accurate range
                    let endLine = i + 1;
                    if (p.lang === 'python') {
                        endLine = this.findPythonBlockEnd(lines, i) + 1;
                    } else {
                        endLine = this.findMatchingBrace(lines, i) + 1;
                    }

                    symbols.push({
                        name: name,
                        kind: p.kind as any,
                        fileUri: relativePath,
                        range: { startLine: i + 1, endLine: endLine },
                        args: args,
                        returnType: returnTypeStr,
                        signature: fullSig,
                        docString: docString
                    });
                     // Found a match
                }
            }
        }
        return symbols;
    }
}
