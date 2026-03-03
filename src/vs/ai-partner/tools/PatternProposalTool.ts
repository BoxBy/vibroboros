/**
 * PatternProposalTool — Phase 11: Skill Evolution
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

/**
 * PatternProposalTool (Phase 11)
 * Extracts architectural "Best Practices" from successful task completions.
 */
export class PatternProposalTool {
    public static readonly TOOL_NAME = 'propose_pattern';

    public async execute(args: { patternName: string; description: string; context: string }): Promise<{ success: boolean; message: string }> {
        const { patternName, description, context } = args;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        if (!workspaceRoot) { return { success: false, message: 'No workspace open.' }; }

        const bestPracticesPath = path.join(workspaceRoot, '.agent', 'best_practices.md');
        const dir = path.dirname(bestPracticesPath);

        try {
            await fs.mkdir(dir, { recursive: true });
            const timestamp = new Date().toISOString();
            const entry = `\n### [${patternName}] (${timestamp})\n**Description**: ${description}\n**Context**: ${context}\n---\n`;
            
            await fs.appendFile(bestPracticesPath, entry);
            return { success: true, message: `Pattern '${patternName}' recorded in best_practices.md` };
        } catch (error: any) {
            return { success: false, message: `Failed to record pattern: ${error.message}` };
        }
    }
}
