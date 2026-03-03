/**
 * EvolutionService — Phase 11: Skill Evolution & "Skill-to-fix-skill"
 *
 * Concept inspired by:
 * - python-project-template (VibeCoding Skillset):
 *   https://github.com/tae0y/python-project-template (MIT License)
 *
 * Implementation is original, written independently.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { IEvolutionService, AgentSuccessRecord } from '../di/interfaces/IEvolutionService';

/**
 * EvolutionService (Phase 11)
 * Tracks agent performance and proposes self-refinement patterns.
 */
export class EvolutionService implements IEvolutionService {
    private static readonly LOG_FILE = '.agent/evolution_logs.jsonl';

    constructor() {}

    private get workspaceRoot(): string {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }

    public async recordExecution(record: AgentSuccessRecord): Promise<void> {
        if (!this.workspaceRoot) {
            return;
        }

        const logPath = path.join(this.workspaceRoot, EvolutionService.LOG_FILE);
        const dir = path.dirname(logPath);
        
        try {
            await fs.mkdir(dir, { recursive: true });
            await fs.appendFile(logPath, JSON.stringify(record) + '\n');
        } catch (error: any) {
            console.error('[EvolutionService] Failed to record execution:', error);
        }
    }

    private safeParseLine(line: string): any | null {
        try { return JSON.parse(line); } catch { return null; }
    }

    private async readAgentRecords(agentName: string): Promise<any[]> {
        if (!this.workspaceRoot) { return []; }
        const logPath = path.join(this.workspaceRoot, EvolutionService.LOG_FILE);
        try {
            const content = await fs.readFile(logPath, 'utf-8');
            return content.trim().split('\n')
                .map(l => this.safeParseLine(l))
                .filter(r => r && r.agentName === agentName);
        } catch {
            return [];
        }
    }

    public async getMetrics(agentName: string): Promise<{ successRate: number; totalExecutions: number }> {
        const records = await this.readAgentRecords(agentName);
        if (records.length === 0) {
            return { successRate: 0, totalExecutions: 0 };
        }
        const successes = records.filter(r => r.success).length;
        return {
            successRate: successes / records.length,
            totalExecutions: records.length
        };
    }

    public async proposeInstructionRefinement(agentName: string): Promise<string | null> {
        const records = await this.readAgentRecords(agentName);
        const totalExecutions = records.length;
        if (totalExecutions < 5) {
            return null;
        }
        const successes = records.filter(r => r.success).length;
        const successRate = successes / totalExecutions;
        if (successRate > 0.8) {
            return null;
        }

        const failures = records.filter(r => !r.success && r.error).slice(-10);
        if (failures.length === 0) {
            return null;
        }

        const errorSample = failures.map((r: any) => r.error as string).join(' | ');
        const successPct = (successRate * 100).toFixed(1);
        return `[EvolutionTip] ${agentName} success rate: ${successPct}% (${totalExecutions} runs). Recent failure patterns: "${errorSample.slice(0, 200)}". Tip: In your <thinking> block, explicitly verify assumptions about file paths, types, and API signatures before acting.`;
    }
}
