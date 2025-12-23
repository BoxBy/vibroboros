import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface AgentState {
    sessionId: string;
    plan: {
        id: string;
        description: string;
        status: 'pending' | 'in-progress' | 'completed' | 'error';
    }[];
    currentStepIndex: number;
    openIssues: string[];
    lastUpdate: string;
}

export class CheckpointService {
    // private static readonly STATE_FILE_NAME = 'state.md';
    private static readonly VIPER_DIR = '.agent';

    constructor() {}

    public async saveCheckpoint(_state: AgentState): Promise<void> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return;
            }

            const rootPath = workspaceFolders[0].uri.fsPath;
            const viperDir = path.join(rootPath, CheckpointService.VIPER_DIR);
            // const stateFile = path.join(viperDir, CheckpointService.STATE_FILE_NAME);

            // Ensure .viper directory exists
            try {
                await fs.mkdir(viperDir, { recursive: true });
            } catch (error) {
                // Ignore if already exists
            }

            // [Disabled per user request]
            // const markdownContent = this.formatStateToMarkdown(state);
            // await fs.writeFile(stateFile, markdownContent, 'utf-8');
        } catch (error) {
            console.error('[CheckpointService] Failed to save checkpoint:', error);
        }
    }

    // private formatStateToMarkdown(state: AgentState): string { ... } [Removed]
}
