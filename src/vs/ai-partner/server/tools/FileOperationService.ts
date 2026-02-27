import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type { IFileOperationService } from '../../di/interfaces/IFileOperationService';

/**
 * File Operation Service
 * Handles file read, write, and other file operations
 */
export class FileOperationService implements IFileOperationService {
    private static instance: FileOperationService;
    private workspaceRoot: string;

    private constructor() {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }

    public static getInstance(): FileOperationService {
        if (!FileOperationService.instance) {
            FileOperationService.instance = new FileOperationService();
        }
        return FileOperationService.instance;
    }

    public static setInstance(instance: FileOperationService): void {
        FileOperationService.instance = instance;
    }

    /**
     * Read file content
     */
    public async readFile(filePath: string, options?: { startLine?: number; endLine?: number }): Promise<{
        success: boolean;
        content?: string;
        error?: string;
    }> {
        try {
            const fullPath = path.join(this.workspaceRoot, filePath);
            const content = await fs.readFile(fullPath, 'utf-8');

            if (options?.startLine || options?.endLine) {
                const lines = content.split('\n');
                const start = (options.startLine || 1) - 1;
                const end = options.endLine || lines.length;
                const sliced = lines.slice(start, end);
                return { success: true, content: sliced.join('\n') };
            }

            return { success: true, content };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Write file content
     */
    public async writeFile(filePath: string, content: string): Promise<{
        success: boolean;
        error?: string;
    }> {
        try {
            const fullPath = path.join(this.workspaceRoot, filePath);
            const dir = path.dirname(fullPath);

            // Ensure directory exists
            await fs.mkdir(dir, { recursive: true });

            await fs.writeFile(fullPath, content, 'utf-8');
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Append to file
     */
    public async appendFile(filePath: string, content: string): Promise<{
        success: boolean;
        error?: string;
    }> {
        try {
            const fullPath = path.join(this.workspaceRoot, filePath);
            const dir = path.dirname(fullPath);

            // Ensure directory exists
            await fs.mkdir(dir, { recursive: true });

            await fs.appendFile(fullPath, content, 'utf-8');
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete file
     */
    public async deleteFile(filePath: string): Promise<{
        success: boolean;
        error?: string;
    }> {
        try {
            const fullPath = path.join(this.workspaceRoot, filePath);
            await fs.unlink(fullPath);
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Replace content in file
     */
    public async replaceInFile(filePath: string, search: string, replace: string, options?: {
        matchCase?: boolean;
        useRegex?: boolean;
    }): Promise<{
        success: boolean;
        replacements?: number;
        error?: string;
    }> {
        try {
            const fullPath = path.join(this.workspaceRoot, filePath);
            let content = await fs.readFile(fullPath, 'utf-8');

            let replacements = 0;
            if (options?.useRegex) {
                const regex = new RegExp(search, options.matchCase ? 'g' : 'gi');
                content = content.replace(regex, replace);
                replacements = (content.match(regex) || []).length;
            } else {
                const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options.matchCase ? 'g' : 'gi');
                content = content.replace(regex, replace);
                replacements = (content.match(regex) || []).length;
            }

            await fs.writeFile(fullPath, content, 'utf-8');
            return { success: true, replacements };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    /**
     * List directory
     */
    public async listDirectory(dirPath: string, recursive?: boolean): Promise<{
        success: boolean;
        files?: string[];
        error?: string;
    }> {
        try {
            const fullPath = path.join(this.workspaceRoot, dirPath);
            const files: string[] = [];

            if (recursive) {
                const walk = async (dir: string, baseDir: string) => {
                    const entries = await fs.readdir(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        const fullPath = path.join(dir, entry.name);
                        const relativePath = path.relative(baseDir, fullPath);
                        if (entry.isDirectory()) {
                            await walk(fullPath, baseDir);
                        } else {
                            files.push(relativePath);
                        }
                    }
                };
                await walk(fullPath, fullPath);
            } else {
                const entries = await fs.readdir(fullPath, { withFileTypes: true });
                for (const entry of entries) {
                    files.push(entry.name);
                }
            }

            return { success: true, files };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
}
