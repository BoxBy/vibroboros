import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { IMemoryService, UserPreferences } from '../di/interfaces/IMemoryService';


/**
 * MemoryService
 * Stores and retrieves user preferences and long-term memory.
 * Persists to .agent/memory.json
 * Now uses dependency injection
 */
export class MemoryService implements IMemoryService {
    private static instance: MemoryService;
    private preferences: UserPreferences;
    private readonly MEMORY_FILE = '.agent/memory.json';
    private sessionStartTime: string;
    private workspaceRoot: string;

    constructor() {
        this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        this.sessionStartTime = new Date().toLocaleString();
        this.preferences = {
            language: 'Korean', // Start with user's language rule
            codingStyle: 'Clean, production-ready code with comprehensive comments',
            preferredFrameworks: [],
            customInstructions: ''
        };
        this.loadMemory();
    }

    public getSessionStartTime(): string {
        return this.sessionStartTime;
    }

    /**
     * @deprecated Use dependency injection instead
     */
    public static getInstance(): MemoryService {
        if (!MemoryService.instance) {
            MemoryService.instance = new MemoryService();
        }
        return MemoryService.instance;
    }

    /**
     * Internal setter for the singleton instance (used by DI container)
     * @internal
     */
    public static setInstance(instance: MemoryService): void {
        MemoryService.instance = instance;
    }

    private getMemoryPath(): string {
        return path.join(this.workspaceRoot, this.MEMORY_FILE);
    }

    private loadMemory() {
        const memPath = this.getMemoryPath();
        if (fs.existsSync(memPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(memPath, 'utf-8'));
                if (data.preferences) {
                    this.preferences = { ...this.preferences, ...data.preferences };
                }
            } catch (e) {
                console.error('[MemoryService] Failed to load memory:', e);
            }
        }
    }

    public async saveMemory() {
        const memPath = this.getMemoryPath();
        const data = {
            lastUpdated: new Date().toISOString(),
            preferences: this.preferences
        };
        // Ensure dir exists (re-using general logic or assuming .agent exists from SWM)
        if (!fs.existsSync(path.dirname(memPath))) {
            fs.mkdirSync(path.dirname(memPath), { recursive: true });
        }
        fs.writeFileSync(memPath, JSON.stringify(data, null, 2));
    }

    public async getPreferences(): Promise<UserPreferences> {
        return this.preferences;
    }

    public async savePreferences(preferences: UserPreferences): Promise<void> {
        this.preferences = preferences;
        await this.saveMemory();
    }

    public async updatePreferences(newPrefs: Partial<UserPreferences>) {
        this.preferences = { ...this.preferences, ...newPrefs };
        await this.saveMemory();
    }
}
