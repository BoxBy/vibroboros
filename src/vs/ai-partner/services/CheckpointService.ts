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
    private static readonly STATE_FILE_NAME = 'state.md';
    private static readonly VIPER_DIR = '.agent';

    constructor() {}

    public async saveCheckpoint(state: AgentState): Promise<void> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return;
            }

            const rootPath = workspaceFolders[0].uri.fsPath;
            const viperDir = path.join(rootPath, CheckpointService.VIPER_DIR);
            const stateFile = path.join(viperDir, CheckpointService.STATE_FILE_NAME);

            // Ensure .viper directory exists
            try {
                await fs.mkdir(viperDir, { recursive: true });
            } catch (error) {
                // Ignore if already exists
            }

            const markdownContent = this.formatStateToMarkdown(state);
            await fs.writeFile(stateFile, markdownContent, 'utf-8');
        } catch (error) {
            console.error('[CheckpointService] Failed to save checkpoint:', error);
        }
    }

    private formatStateToMarkdown(state: AgentState): string {
        const lines: string[] = [];
        lines.push(`# Viper Agent State`);
        lines.push(`**Last Update:** ${state.lastUpdate}`);
        lines.push(`**Session ID:** ${state.sessionId}`);
        lines.push('');

        lines.push(`## Current Plan`);
        if (state.plan.length === 0) {
            lines.push('No active plan.');
        } else {
            state.plan.forEach((step, index) => {
                const mark = step.status === 'completed' ? '[x]' : (step.status === 'in-progress' ? '[/]' : (step.status === 'error' ? '[!]' : '[ ]'));
                const currentMarker = index === state.currentStepIndex ? '👈 Current Step' : '';
                lines.push(`- ${mark} **Step ${index + 1}:** ${step.description} ${currentMarker}`);
            });
        }
        lines.push('');

        lines.push(`## Open Issues / Context`);
        if (state.openIssues.length === 0) {
            lines.push('No open issues recorded.');
        } else {
            state.openIssues.forEach(issue => {
                lines.push(`- ${issue}`);
            });
        }

        return lines.join('\n');
    }
}
