import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';
import { MCPMessage } from '../interfaces/MCPMessage';
import { MCPServer } from '../server/MCPServer';
import { LLMService } from '../services/LLMService';
import { ConfigService } from '../config_service';
import { randomUUID } from 'crypto';

/**
 * An agent specialized in autonomously generating and updating the project README.md file.
 */
export class ReadmeGenerationAgent {
    private static readonly AGENT_ID = 'ReadmeGenerationAgent';

    constructor(
        private dispatch: (message: A2AMessage<any>) => Promise<void>,
        private mcpServer: MCPServer,
        private llmService: LLMService,
        private configService: ConfigService
    ) {}

    /**
     * Handles incoming messages. It triggers on 'request-readme-generation'.
     */
    public async handleA2AMessage(message: A2AMessage<any>): Promise<void> {
        if (message.type !== 'request-readme-generation') {
            return;
        }

        this._sendStatusBarUpdate('Auto-updating README.md... Gathering project context.');

        try {
            const planContent = await this._readFileWithTool('PLAN.md');
            const progressContent = await this._readFileWithTool('PROGRESS.md');
            const taskContent = await this._readFileWithTool('TASK.md');

            const systemPrompt = `You are a senior software engineer tasked with writing a high-quality, professional README.md file for a new open-source project. Your audience is other developers.

Your goal is to create a README similar in structure and quality to the example provided below. You must adapt the content to the project's context.

**Key Sections to Include:**
- A title and a brief, engaging introduction.
- Badges for important links (like documentation, license, etc.).
- A "News" or "Updates" section for recent changes.
- "Performance" section if applicable (you can use placeholders if you don't have data).
- "How to Run" or "Getting Started" with clear code examples.
- "Deployment" instructions if applicable.
- "Contributing" guidelines.
- "License" information.
- "Citation" if the project is academic.

**Example README Structure:**

<details>
<summary>Click to see an example of a high-quality README</summary>

# PROJECT_NAME
<p align="center">
<img src="path/to/logo.svg", width="400">
</p>

<div align="center">
  <!-- Badges -->
</div>

## Introduction
...

## News
...

## Performance
...

## Getting Started
...

</details>

---

Now, using the provided project context (PLAN.md, PROGRESS.md, TASK.md), generate a complete README.md file in Markdown format for the current project. For the "Documentation" section, ensure it links to detailed philosophy and architecture documents located in a 'docs' folder (e.g., './docs/philosophy.md', './docs/architecture.md').`;

            const userPrompt = `Here is the context for the project:

` + 
                               `--- PROJECT PLAN (PLAN.md) ---
${planContent}

` + 
                               `--- CURRENT PROGRESS (PROGRESS.md) ---
${progressContent}

` + 
                               `--- KEY TASKS (TASK.md) ---
${taskContent}

` + 
                               `Based on all this information, please generate a complete README.md file.`;

            this._sendStatusBarUpdate('Context gathered. Asking LLM to generate the README...');

            const model = this.configService.getModel(ReadmeGenerationAgent.AGENT_ID);
            const apiKeys = this.configService.getApiKeys();
            const endpoint = this.configService.getEndpoint();

            const llmResponse = await this.llmService.requestLLMCompletion(
                [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                apiKeys[0] || '',
                endpoint,
                [],
                model
            );

            const generatedReadme = llmResponse.choices[0]?.message?.content;

            if (!generatedReadme) {
                throw new Error('LLM failed to generate a README.');
            }

            this._sendStatusBarUpdate('README content generated. Saving file automatically...');

            const readmePath = vscode.workspace.workspaceFolders ? `${vscode.workspace.workspaceFolders[0].uri.fsPath}/README.md` : 'README.md';
            await this._writeFileWithTool(readmePath, generatedReadme);

            // Send a final confirmation to the Orchestrator.
            await this.dispatch({
                sender: ReadmeGenerationAgent.AGENT_ID,
                recipient: 'OrchestratorAgent',
                timestamp: new Date().toISOString(),
                type: 'response-readme-generation-complete',
                payload: { status: 'success', filePath: readmePath }
            });

        } catch (error: any) {
            console.error(`[${ReadmeGenerationAgent.AGENT_ID}] Error:`, error);
            // Notify the orchestrator of the failure.
            await this.dispatch({
                sender: ReadmeGenerationAgent.AGENT_ID,
                recipient: 'OrchestratorAgent',
                timestamp: new Date().toISOString(),
                type: 'response-readme-generation-complete',
                payload: { status: 'error', message: error.message }
            });
        }
    }

    private async _readFileWithTool(fileName: string): Promise<string> {
        const rootPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
        if (!rootPath) {return `Could not find workspace root to read ${fileName}`;}

        const filePath = `${rootPath}/${fileName}`;

        try {
            const fileReadRequest: MCPMessage<{ name: string; arguments: { filePath: string; }; }> = {
                jsonrpc: '2.0',
                id: randomUUID(),
                method: 'tools/call',
                params: { name: 'FileReadTool', arguments: { filePath } }
            };
            const response = await this.mcpServer.handleRequest(fileReadRequest);
            return response.result?.content?.[0]?.text || `File not found or empty: ${fileName}`;
        } catch (e) {
            console.error(`[${ReadmeGenerationAgent.AGENT_ID}] Failed to read ${fileName} with FileReadTool`, e);
            return `Error reading file: ${fileName}`;
        }
    }

    private async _writeFileWithTool(filePath: string, content: string): Promise<void> {
        try {
            const fileWriteRequest: MCPMessage<{ name: string; arguments: { filePath: string; content: string; }; }> = {
                jsonrpc: '2.0',
                id: randomUUID(),
                method: 'tools/call',
                params: { name: 'FileWriteTool', arguments: { filePath, content } }
            };
            await this.mcpServer.handleRequest(fileWriteRequest);
        } catch (e) {
            console.error(`[${ReadmeGenerationAgent.AGENT_ID}] Failed to write to ${filePath} with FileWriteTool`, e);
            throw new Error(`Failed to write README.md to ${filePath}.`);
        }
    }

    private _sendStatusBarUpdate(text: string) {
        this.dispatch({
            sender: ReadmeGenerationAgent.AGENT_ID,
            recipient: 'OrchestratorAgent',
            timestamp: new Date().toISOString(),
            type: 'statusUpdate',
            payload: { text }
        });
    }
}