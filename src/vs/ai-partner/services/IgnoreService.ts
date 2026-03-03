import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * IgnoreService
 * 
 * Manages .gitignore and .agentignore patterns.
 * Provides central logic for filtering files in searches and context loading.
 */
export class IgnoreService {
    private static instance: IgnoreService;
    private ignorePatterns: string[] = [];
    private isInitialized = false;

    private constructor() {}

    public static getInstance(): IgnoreService {
        if (!IgnoreService.instance) {
            IgnoreService.instance = new IgnoreService();
        }
        return IgnoreService.instance;
    }

    /**
     * Initializes the service by reading ignore files from the workspace root.
     */
    public async initialize(): Promise<void> {
        if (this.isInitialized) return;

        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return;

        const ignoreFiles = ['.gitignore', '.agentignore'];
        const patterns = new Set<string>();

        for (const file of ignoreFiles) {
            const filePath = path.join(root, file);
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const lines = content.split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'));
                lines.forEach(l => patterns.add(l));
            } catch (e) {
                // Ignore if file doesn't exist
            }
        }
        
        // Add common default ignores if not present
        const defaults = ['node_modules', '.git', '.vscode', 'dist', 'out', 'build', '.agent'];
        defaults.forEach(d => patterns.add(d));

        this.ignorePatterns = Array.from(patterns);
        this.isInitialized = true;
    }

    /**
     * Checks if a given file path should be ignored.
     */
    public isIgnored(filePath: string): boolean {
        const relativePath = vscode.workspace.asRelativePath(filePath);
        
        for (const pattern of this.ignorePatterns) {
            const normalizedPattern = pattern.replace(/\/$/, '').replace(/^[\\/]/, '');
            
            // 1. Exact match or starts with pattern (directory match)
            if (relativePath === normalizedPattern || relativePath.startsWith(normalizedPattern + '/')) {
                return true;
            }
            
            // 2. Any part of the path matches (e.g. "node_modules")
            const parts = relativePath.split(/[\\/]/);
            if (parts.includes(normalizedPattern)) {
                return true;
            }

            // 3. Simple glob matching for * extensions (e.g. "*.log")
            if (normalizedPattern.startsWith('*.')) {
                const ext = normalizedPattern.substring(1);
                if (relativePath.endsWith(ext)) return true;
            }
        }
        return false;
    }

    /**
     * Returns a glob string suitable for vscode.workspace.findFiles excludes.
     */
    public getExcludesGlob(): string {
        if (this.ignorePatterns.length === 0) return '**/node_modules/**';

        const globs = this.ignorePatterns.map(p => {
            const clean = p.replace(/\/$/, '').replace(/^[\\/]/, '');
            if (clean.includes('*')) return `**/${clean}`;
            return `**/${clean}/**`;
        });
        
        return `{${globs.join(',')}}`;
    }
}
