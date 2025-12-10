import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Loads custom agent configuration from workspace markdown file.
 * Path: [WorkspaceRoot]/.gemini/AGENTS.md (or GEMINI.md)
 * Format:
 * # Common
 * ...
 * # [AgentName]
 * ...
 * 
 * @param agentName The name of the agent to load configuration for
 * @returns Combined common and agent-specific prompt instructions
 */
export async function loadPromptConfig(agentName: string): Promise<string> {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return '';
        }
        const rootPath = workspaceFolders[0].uri.fsPath;
        const configNames = ['AGENTS.md', 'GEMINI.md'];
        let content = '';
        let loadedPath = '';

        for (const name of configNames) {
            const checkPath = path.join(rootPath, '.gemini', name);
            try {
                content = await fs.promises.readFile(checkPath, 'utf-8');
                loadedPath = checkPath;
                break;
            } catch {
                // Try next
            }
        }

        if (!content) {
            return '';
        }

        // console.log(`[promptLoader] Loaded custom configuration from ${loadedPath}`);

        // Parse sections using simple regex/string searching
        // We look for headers like '# Common' or '## Common' regarding the agent name
        const lines = content.split('\n');
        let currentSection = '';
        let commonPrompt = '';
        let agentPrompt = '';

        for (const line of lines) {
            // Match headers like "# Common", "## Common", "# CodeEditAgent"
            const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
            if (headerMatch) {
                currentSection = headerMatch[2].trim();
                continue;
            }

            if (currentSection.toLowerCase() === 'common' || currentSection.toLowerCase() === 'global') {
                commonPrompt += line + '\n';
            } else if (currentSection === agentName) {
                agentPrompt += line + '\n';
            }
        }

        let result = '';
        if (commonPrompt.trim()) {
            result += `\n\n[Project Common Instructions]\n${commonPrompt.trim()}`;
        }
        if (agentPrompt.trim()) {
            result += `\n\n[User Custom Instructions for ${agentName}]\n${agentPrompt.trim()}`;
        }

        return result;
    } catch (e: any) {
        console.error(`[promptLoader] Failed to load agent config: ${e.message}`);
    }
    return '';
}
