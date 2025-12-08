import { AgentCard } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { BaseAgent } from "../core/BaseAgent";
import * as vscode from 'vscode';
import { runLLMLoop } from "../utils/agentHelpers";
import { v4 as uuidv4 } from 'uuid';

interface BugReport {
    error: string;
    filePath?: string;
    description?: string;
}

interface RootCauseAnalysis {
    isRootCause: boolean;
    reasoning: string;
    deeperCause?: {
        file: string;
        suspectedFunction?: string;
    };
    fix?: string;
}

export class BugFixAgent extends BaseAgent {
    public static readonly AGENT_CARD: AgentCard = {
        name: 'BugFixAgent',
        description: 'A specialized agent that performs recursive root cause analysis to fix complex bugs. It traces errors upstream rather than just patching symptoms.',
        capabilities: {} as any, 
        version: '1.0.0',
        url: '',
        skills: ['debugging', 'root-cause-analysis'] as any 
    };

    constructor(
        card: AgentCard, 
        state: vscode.Memento
    ) {
        super(card, state);
    }

    async execute(context: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
        this.log('Starting Bug Fix Analysis...');
        const anyMsg = (context as any).message || (context as any).request?.message || context;
        const payload = anyMsg.payload as BugReport;
        
        if (!payload || !payload.error) {
            await eventBus.publish({ kind: 'event', type: 'response', message: "Error: No error message provided for analysis.", timestamp: new Date().toISOString(), messageId: uuidv4() } as any);
            return;
        }

        const initialFile = payload.filePath || 'Unknown File';
        this.log(`Analyzing error in ${initialFile}: ${payload.error}`);
        await this.sendProgress(eventBus, `Starting recursive analysis for error in ${initialFile}...`);

        try {
            const analysisChain = await this.recursiveAnalysis(payload.error, initialFile, 0, eventBus);
            
            const finalReport = `## Root Cause Analysis Report\n\n${analysisChain.map(Step => Step).join('\n\n')}`;
            await eventBus.publish({ kind: 'event', type: 'response', payload: { text: finalReport }, timestamp: new Date().toISOString(), messageId: uuidv4() } as any);

        } catch (e: any) {
            this.log(`Analysis failed: ${e.message}`);
            await eventBus.publish({ kind: 'event', type: 'error', message: `Analysis failed: ${e.message}`, timestamp: new Date().toISOString(), messageId: uuidv4() } as any);
        }
    }

    private async sendProgress(eventBus: ExecutionEventBus, text: string) {
        await eventBus.publish({ 
            kind: 'event', 
            type: 'log', 
            message: text,
            timestamp: new Date().toISOString(),
            messageId: uuidv4() 
        } as any);
    }

    private async recursiveAnalysis(error: string, currentFile: string, depth: number, eventBus: ExecutionEventBus): Promise<string[]> {
        // Soft safety net (100)
        if (depth > 100) {
            return ["**Max Depth Reached (Safety Net)**: The error chain is surprisingly deep. Stopping recursion to prevent crash."];
        }

        await this.sendProgress(eventBus, `[Depth ${depth}] Analyzing ${currentFile}...`);

        // 1. Read the file content
        let fileContent = '';
        try {
             const mcp = this.mcpClient;
             if (mcp) {
                 const readRes: any = await mcp.callTool({
                     name: 'read_file',
                     arguments: { path: currentFile }
                 });
                 // Ensure we extract string content
                 fileContent = (readRes?.content && Array.isArray(readRes.content)) 
                    ? readRes.content.map((c: any) => c.text || '').join('') 
                    : JSON.stringify(readRes);
             } else {
                 fileContent = "(MCP Client not available)";
             }
        } catch (e) {
            fileContent = "(Failed to read file)";
        }

        // 2. Ask LLM to analyze
        const prompt = `
You are a Senior Debugging Engineer performing a Recursive Root Cause Analysis.
Current Depth: ${depth}
Current File: ${currentFile}
Error Message: "${error}"

File Content (Truncated):
\`\`\`
${fileContent.slice(0, 5000)}
\`\`\`

Task: Determine if the error originates here (Root Cause) or is passed down from a caller/dependency (Symptom).
- If it is a SYMPTOM, identify the caller or dependency file to trace next.
- If it is the ROOT CAUSE, provide a fix.
- IMPORTANT: If you cannot trace further or if the chain is becoming circular/irrelevant, mark as ROOT CAUSE (best effort fix) or stop recursion.

Return valid JSON strictly matching this interface:
{
    "isRootCause": boolean,
    "reasoning": "detailed explanation of why this file is the root cause or just a symptom",
    "deeperCause": {
        "file": "absolute path to the likely upstream file",
        "suspectedFunction": "name of function"
    } | null,
    "fix": "code block with the fix if it is the root cause, or null"
}
`;
        const apiKeys = await this.configService.getApiKeys();
        
        const analysis = await runLLMLoop<RootCauseAnalysis>(
            async () => {
                const result = await this.llmService.requestLLMCompletion(
                    this.configService.getLlmProvider(), 
                    [{ role: 'user', content: prompt }], 
                    apiKeys[0] || '', 
                    this.configService.getEndpoint(),
                    [],
                    this.configService.getModel('BugFixAgent')
                );
                return (result as any).choices[0].message.content || '{}';
            },
            (text) => JSON.parse(text),
            (res) => ({ valid: typeof res.isRootCause === 'boolean' })
        );

        const reportStep = `### Step ${depth + 1}: ${currentFile}\n- **Analysis**: ${analysis.reasoning}\n- **Verdict**: ${analysis.isRootCause ? 'ROOT CAUSE' : 'SYMPTOM'}`;

        if (analysis.isRootCause) {
            return [reportStep + `\n- **Proposed Fix**:\n${analysis.fix}`];
        } else if (analysis.deeperCause && analysis.deeperCause.file) {
            const nextFile = analysis.deeperCause.file;
            // Recursive call
            const chain = await this.recursiveAnalysis(error, nextFile, depth + 1, eventBus);
            return [reportStep, ...chain];
        } else {
            return [reportStep + "\n- **End of Chain**: Could not trace further upstream."];
        }
    }
}
