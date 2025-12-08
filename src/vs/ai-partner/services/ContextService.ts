import * as vscode from 'vscode';
import * as path from 'path';

export interface ContextItem {
    type: 'file' | 'snippet' | 'summary';
    uri: string;
    content: string;
    relevance: number; // 0-1 score
}

export class ContextService {
    constructor() {}

    /**
     * Retrieves relevant context based on the query.
     * Currently implements a basic heuristic: returns open tabs and recently active files.
     * Future improvements: RAG, semantic search, etc.
     */
    public async loadContext(query: string): Promise<string> {
        try {
            const contextItems: ContextItem[] = [];

            // 1. Get Open Tabs (Basic Context)
            const openTabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
            let tokenCount = 0;
            const MAX_TOKENS = 2000; // Rough limit

            for (const tab of openTabs) {
                if (tab.input instanceof vscode.TabInputText) {
                    const uri = tab.input.uri;
                    if (uri.scheme === 'file') {
                        // Check if file exists on disk (ignore deleted files still open in tabs)
                        try {
                            await vscode.workspace.fs.stat(uri);
                        } catch {
                            continue;
                        }

                        // Read file content
                        try {
                            const doc = await vscode.workspace.openTextDocument(uri);
                            const text = doc.getText();
                            // Truncate if too large (simple char count approximation: 1 token ~ 4 chars)
                            const maxChars = 1000; 
                            const truncated = text.length > maxChars ? text.substring(0, maxChars) + `\n... (truncated, total ${text.length} chars)` : text;
                            
                            contextItems.push({
                                type: 'file',
                                uri: uri.fsPath,
                                content: `File: ${path.basename(uri.fsPath)}\n\`\`\`\n${truncated}\n\`\`\``,
                                relevance: 0.5
                            });
                            
                            tokenCount += truncated.length / 4;
                            if (tokenCount >= MAX_TOKENS) break;
                        } catch (e) {
                            console.warn(`[ContextService] Failed to read ${uri.fsPath}:`, e);
                        }
                    }
                }
            }

            // 2. TODO: Implement keyword matching or vector search against workspace files

            return this.formatContext(contextItems);

        } catch (error) {
            console.error('[ContextService] Failed to load context:', error);
            return '';
        }
    }

    private formatContext(items: ContextItem[]): string {
        if (items.length === 0) {
            return '';
        }

        const lines: string[] = [];
        lines.push('## Dynamic Context (Open Files)');
        items.forEach(item => {
            lines.push(`- ${item.content} (${item.uri})`);
        });
        
        return lines.join('\n');
    }
    
    private contextState: ContextState = {
        primarySource: undefined,
        activeFocus: undefined,
        derivations: new Set(),
        references: new Set()
    };

    /**
     * Updates the Active Focus (Spotlight).
     * If the new focus is a Source File, it updates the Primary Source.
     */
    public updateFocus(filePath: string): void {
        this.contextState.activeFocus = filePath;
        
        // Simple heuristic: If it looks like a source file (not test/doc), set as Primary Source
        // unless we are "locked" onto a different task (TODO: Locked mode)
        const baseName = path.basename(filePath).toLowerCase();
        const isDerived = baseName.includes('test') || baseName.includes('spec') || baseName.endsWith('.md') || baseName.includes('doc');
        const isCode = /\.(ts|js|py|java|c|cpp|rs|go|rb|php)$/.test(baseName);

        if (isCode && !isDerived) {
            this.contextState.primarySource = filePath;
        } else if (isDerived) {
            this.contextState.derivations.add(filePath);
        }
    }

    public getContextState(): ContextState {
        return this.contextState;
    }

    public resetContext(): void {
        this.contextState = {
            primarySource: undefined,
            activeFocus: undefined,
            derivations: new Set(),
            references: new Set()
        };
    }
    
    public getActiveFile(): string | undefined {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.uri.scheme === 'file') {
            const currentPath = activeEditor.document.uri.fsPath;
            // Auto-update focus on read? Maybe explicit call is better.
            return currentPath;
        }
        return undefined;
    }
}

export interface ContextState {
    primarySource: string | undefined;   // The "Main Character" (e.g., auth.ts)
    activeFocus: string | undefined;     // The file currently being viewed/edited
    derivations: Set<string>;            // Tests, Docs, etc.
    references: Set<string>;             // Read-only references
}
