import * as fs from 'fs/promises';
import * as path from 'path';
import * as https from 'https';
import * as vscode from 'vscode';
import { z } from 'zod';

const projectDetectionFiles: { [key: string]: string } = {
    'node': 'package.json',
    'python': 'requirements.txt',
    'java': 'pom.xml',
    'go': 'go.mod',
    'ruby': 'Gemfile',
    'rust': 'Cargo.toml',
};

async function detectProjectTypes(): Promise<string[]> {
    const detectedTypes: string[] = [];
    for (const type in projectDetectionFiles) {
        const pattern = `**/${projectDetectionFiles[type]}`;
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 1);
        if (files.length > 0) {
            detectedTypes.push(type);
        }
    }
    return detectedTypes;
}

async function fetchGitignoreContent(types: string[]): Promise<string> {
    const url = `https://www.toptal.com/developers/gitignore/api/${types.join(',')}`;
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve(data); });
        }).on('error', (err) => { reject(err); });
    });
}

const inputSchema = z.object({
    types: z.array(z.string()).optional().describe("An optional list of project types. If empty, auto-detection will be used."),
});

const outputSchema = z.object({
    message: z.string().describe("A confirmation message, including the path to the created file and the types used."),
});

export function getGitignoreToolDefinition() {
    return {
        name: 'GitignoreTool',
        description: {
            title: "Create .gitignore file",
            description: "Creates a .gitignore file based on a list of project types (e.g., node, python). If no types are provided, it will attempt to auto-detect them.",
            inputSchema: inputSchema,
            outputSchema: outputSchema,
        },
        handler: async ({ types }: z.infer<typeof inputSchema>): Promise<z.infer<typeof outputSchema>> => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folder is open.');
            }
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const gitignorePath = path.resolve(workspaceRoot, '.gitignore');

            let projectTypes = types;
            if (!projectTypes || projectTypes.length === 0) {
                projectTypes = await detectProjectTypes();
            }

            if (!projectTypes || projectTypes.length === 0) {
                throw new Error('Could not auto-detect any project types. Please specify them manually.');
            }

            try {
                const content = await fetchGitignoreContent(projectTypes);
                await fs.writeFile(gitignorePath, content, 'utf-8');
                const message = `Successfully created .gitignore file for: ${projectTypes.join(', ')}`;
                return { message };
            } catch (error: any) {
                throw new Error(`Failed to create .gitignore file. Error: ${error.message}`);
            }
        }
    };
}
