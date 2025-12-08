import { AgentCard, Message } from "@a2a-js/sdk";
import { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from 'uuid';
import { publishProgressLog } from './utils/sdkProgressHelper';
import { LLMService } from '../services/LLMService';
import { getCoreLLMTools } from '../services/LLMTools';
import { ConfigService } from '../config_service';
import { getMcpClient } from "../mcp_client_provider";
import * as mcpClientModule from "@modelcontextprotocol/sdk/client";
import * as vscode from 'vscode';
import * as path from 'path';
import { runLLMLoop } from './utils/agentHelpers';

export class TaskDecompositionAgent implements AgentExecutor {
    private llmService: LLMService;
    private configService: ConfigService;
    private mcpClient: mcpClientModule.Client;

    constructor(private card: AgentCard) {
        this.llmService = LLMService.getInstance();
        this.configService = ConfigService.getInstance();
        this.mcpClient = getMcpClient();
    }

    async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
        try {
            const anyCtx: any = requestContext as any;
            const msgObj = anyCtx?.message || anyCtx?.request?.message || anyCtx?.request || anyCtx;
            let parts = Array.isArray(msgObj?.parts) ? msgObj.parts : (Array.isArray(anyCtx?.parts) ? anyCtx.parts : []);

            // Check if this is an update-task command
            const dataPart = parts.find((p: any) => p && p.kind === 'data' && p.mimeType === 'application/vnd.a2a+json');
            if (dataPart?.data?.command === 'update-task') {
                await this.handleUpdateTask(dataPart.data.payload, eventBus, requestContext);
                return;
            }

            // Extract user goal from text parts
            const textPart = Array.isArray(parts) ? parts.find((p: any) => p && (p.kind === 'text' || p.type === 'text') && typeof (p.text ?? p.content) === 'string') : undefined;
            let userGoal = String((textPart?.text ?? (textPart as any)?.content ?? '') || '').trim();

            // Fallback: try to extract text from various legacy formats if standard parts failed
            if (!userGoal) {
                try {
                    if (typeof (msgObj as any)?.text === 'string' && (msgObj as any).text.trim()) { userGoal = (msgObj as any).text.trim(); }
                    else if (typeof (msgObj as any)?.content === 'string') { userGoal = (msgObj as any).content.trim(); }
                } catch {}
            }

            if (!userGoal) { throw new Error('No goal provided for decomposition.'); }

            publishProgressLog(eventBus, `Decomposing goal: "${userGoal}"`, requestContext);

            const example = '[ "Task 1", "Task 2" ]';

            const prompt = `
Break down the user's goal into a concrete, ordered set of development tasks. Use a neutral, professional tone.

**// CONTEXT**
- **User's Goal:** "${userGoal}"

**// OUTPUT FORMAT**
1. <thinking>
Briefly explain your decomposition strategy.
</thinking>
2. TASKS: Output a SINGLE JSON array of strings in a markdown code block.

**// RULES**
1. Actionable & Concrete: Each task must be directly executable.
2. Logical Order: Sequence matters.
3. Output MUST be a single JSON array of strings ONLY inside \`\`\`json ... \`\`\`.
4. **EXCLUDE follow-up/documentation tasks**.
5. **INCLUDE ONLY core implementation**.
6. **CLARIFICATION**: If vague, return {"request_clarification": {"question": "...", "context": "...", "options": [...]}}.

**// EXAMPLE**
THINKING: The user wants X, so I need to do A, then B.
\`\`\`json
[ "Task 1", "Task 2" ]
\`\`\`
`;

            const model = this.configService.getModel();
            const apiKeys = await this.configService.getApiKeys();
            const apiKey = (apiKeys && apiKeys[0]) || '';
            const endpoint = this.configService.getEndpoint();
            const provider = this.configService.getLlmProvider();

            const stream = this.configService.isStreamingEnabled(this.card.name);
            let inThinkingBlock = false;
            let buffer = '';

            const onChunk = stream ? (chunk: string) => {
                if (!chunk) return;
                buffer += chunk;
                
                let output = '';
                let i = 0;
                
                while (i < buffer.length) {
                    if (inThinkingBlock) {
                        const closeIdx = buffer.indexOf('</thinking>', i);
                        if (closeIdx !== -1) {
                            // Found closing tag. Output content up to tag.
                            output += buffer.slice(i, closeIdx);
                            inThinkingBlock = false;
                            i = closeIdx + 11; // Skip </thinking>
                        } else {
                            // No closing tag. Output safe part, keep tail for partial tag.
                            // </thinking> is 11 chars.
                            const remaining = buffer.length - i;
                            if (remaining < 11) {
                                break; // Keep all in buffer
                            } else {
                                const safeEnd = buffer.length - 10;
                                output += buffer.slice(i, safeEnd);
                                i = safeEnd;
                                break;
                            }
                        }
                    } else {
                        const openIdx = buffer.indexOf('<thinking>', i);
                        if (openIdx !== -1) {
                            // Found opening tag.
                            inThinkingBlock = true;
                            i = openIdx + 10; // Skip <thinking>

                            // Force a new log line for the new thinking block
                            const startMsg: Message = {
                                kind: 'message',
                                messageId: uuidv4(),
                                role: 'agent',
                                parts: [{
                                    kind: 'data',
                                    mimeType: 'application/vnd.a2a+json',
                                    data: {
                                        toolName: 'OrchestratorAgent',
                                        command: 'status-update',
                                        payload: { state: 'working', message: '> ', final: false }
                                    }
                                }],
                                contextId: requestContext.contextId
                            } as any;
                            eventBus.publish(startMsg as any);
                        } else {
                            // No opening tag. Suppress everything but keep tail for partial tag.
                            // <thinking> is 10 chars.
                            const remaining = buffer.length - i;
                            if (remaining < 10) {
                                break; // Keep all in buffer
                            } else {
                                // Suppress content (skip i)
                                const safeEnd = buffer.length - 9;
                                i = safeEnd;
                                break;
                            }
                        }
                    }
                }
                
                // Update buffer to keep only unprocessed part
                buffer = buffer.slice(i);

                if (output) {
                    const streamingMsg: Message = {
                        kind: 'message',
                        messageId: uuidv4(),
                        role: 'agent',
                        parts: [{
                            kind: 'data',
                            mimeType: 'application/vnd.a2a+json',
                            data: {
                                toolName: 'OrchestratorAgent',
                                command: 'status-update',
                                payload: { state: 'streaming-chunk', message: output, final: false }
                            }
                        }],
                        contextId: requestContext.contextId
                    } as any;
                    eventBus.publish(streamingMsg as any);
                }
            } : undefined;

            const llmCall = async (previousError?: string) => {
                const messages: any[] = [{ role: 'user', content: prompt }];
                if (previousError) {
                    messages.push({ role: 'user', content: `Previous attempt failed: ${previousError}. Please try again.` });
                }
                const resp = await this.llmService.requestLLMCompletion(
                    provider, messages, apiKey, endpoint, getCoreLLMTools(provider), model, onChunk
                );
                return (resp.choices[0]?.message?.content ?? (resp as any)?.choices?.[0]?.text ?? '').toString();
            };

            const parser = (text: string) => {
                // 1. Try extracting from markdown block
                const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[1]);
                }
                // 2. Fallback: try finding array or object in text
                const jsonStart = text.indexOf('[');
                const objStart = text.indexOf('{');
                const start = (jsonStart >= 0 && (objStart < 0 || jsonStart < objStart)) ? jsonStart : objStart;
                
                if (start >= 0) {
                    const candidate = text.slice(start);
                    // Try to parse the first valid JSON structure
                    try { return JSON.parse(candidate); } catch {}
                    // If simple parse fails, try to find balanced end
                    let depth = 0;
                    for (let i = 0; i < candidate.length; i++) {
                        const ch = candidate[i];
                        if (ch === '{' || ch === '[') { depth++; }
                        else if (ch === '}' || ch === ']') { depth--; }
                        if (depth === 0) { return JSON.parse(candidate.slice(0, i + 1)); }
                    }
                }
                throw new Error('No JSON found in response');
            };

            const validator = (parsed: any) => {
                if (Array.isArray(parsed)) {
                    if (parsed.length === 0) { return { valid: false, error: "Task list is empty" }; }
                    if (!parsed.every(t => typeof t === 'string')) { return { valid: false, error: "All tasks must be strings" }; }
                    return { valid: true };
                }
                if (parsed.request_clarification) {
                    if (!parsed.request_clarification.question) { return { valid: false, error: "Missing clarification question" }; }
                    return { valid: true };
                }
                return { valid: false, error: "Output must be an array of strings or a clarification object" };
            };

            let tasks: any;
            try {
                tasks = await runLLMLoop(llmCall, parser, validator, 3);
            } catch (e: any) {
                throw new Error(`Failed to decompose tasks: ${e.message}`);
            }

            // Handle Clarification
            if (!Array.isArray(tasks) && tasks?.request_clarification) {
                const { question, context, options } = tasks.request_clarification;
                const clarificationMsg: Message = {
                    kind: 'message',
                    messageId: uuidv4(),
                    role: 'agent',
                    parts: [{
                        kind: 'data',
                        mimeType: 'application/vnd.clarification-request+json',
                        data: { question, context, options }
                    } as any],
                };
                eventBus.publish(clarificationMsg);
                return;
            }

            if (!Array.isArray(tasks)) {
                 throw new Error('The AI returned an invalid format (expected array or clarification object).');
            }

            const artifact: any = {
                kind: 'artifact',
                artifactId: uuidv4(),
                mimeType: 'application/json',
                data: tasks,
            };
            eventBus.publish(artifact as any);

            // Generate TASK.md content
            const taskContent = tasks.map((step, i) => {
                // Strip existing numbering and bullet points if present (e.g. "1. Step" -> "Step", "- Step" -> "Step", "* Step" -> "Step")
                let cleanStep = step.replace(/^[\d\-*+•]\s*\.?\s*/, '').trim();
                // Additional cleanup for multiple numbering patterns
                cleanStep = cleanStep.replace(/^\d+\.\s*/, '').trim();
                return `${i + 1}. [ ] ${cleanStep}`;
            }).join('\n');
            const newTaskMarkdown = `# Implementation Tasks\n\n${taskContent}`;

            // Write TASK.md file - always replace existing content (RPD format - each task list replaces the previous)
            const rootPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
            if (rootPath && this.mcpClient) {
                const taskPath = path.join(rootPath, 'TASK.md');
                try {
                    await this.mcpClient.callTool({ name: 'FileWriteTool', arguments: { filePath: taskPath, content: newTaskMarkdown } } as any);
                    publishProgressLog(eventBus, `[TaskDecompositionAgent] Created/updated TASK.md`, requestContext);
                } catch (e) {
                    console.error('[TaskDecompositionAgent] Failed to write TASK.md:', e);
                    // Non-critical error, proceed with messaging
                }
            }

            // Send propose-task message to OrchestratorAgent (NOT propose-plan - that's BrainstormAgent's job)
            const taskMsg: Message = {
                kind: 'message',
                messageId: uuidv4(),
                role: 'agent',
                parts: [{
                    kind: 'data',
                    mimeType: 'application/vnd.a2a+json',
                    data: {
                        toolName: 'OrchestratorAgent',
                        command: 'propose-task',
                        payload: { tasks, filePath: 'TASK.md' }
                    }
                } as any],
            };
            try {
                console.log('[TaskDecompositionAgent] publish -> propose-task', { count: tasks.length });
            } catch {}
            eventBus.publish(taskMsg);

            const finalMessage: Message = {
                kind: "message",
                messageId: uuidv4(),
                role: "agent",
                parts: [{ kind: "text", text: 'I have broken down the goal into tasks and created TASK.md.' }],
            };
            eventBus.publish(finalMessage);

        } catch (e: any) {
            const errorMessage: Message = {
                kind: "message",
                messageId: uuidv4(),
                role: "agent",
                parts: [{ kind: "text", text: `An error occurred during task decomposition: ${e.message}` }],
            };
            eventBus.publish(errorMessage);
        }
    }

    async cancelTask(): Promise<void> {
        // no-op
    }

    /**
     * Handle update-task command to mark step as completed in TASK.md
     */
    /**
     * Handle update-task command to mark step as completed in TASK.md
     */
    private async handleUpdateTask(payload: any, eventBus: ExecutionEventBus, requestContext: RequestContext): Promise<void> {
        const { stepIndex, stepDescription } = payload;

        try {
            const rootPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
            if (!rootPath || !this.mcpClient) {
                return;
            }

            const taskPath = path.join(rootPath, 'TASK.md');

            // Read current TASK.md
            let taskContent = '';
            try {
                const readResult = await this.mcpClient.callTool({ name: 'FileReadTool', arguments: { filePath: taskPath } } as any);
                taskContent = (typeof readResult?.content === 'string' ? readResult.content : '') || '';
            } catch (e) {
                console.error('[TaskDecompositionAgent] Failed to read TASK.md:', e);
                // Report error via eventBus
                const errorMsg: Message = {
                    kind: 'message',
                    messageId: uuidv4(),
                    role: 'agent',
                    parts: [{ kind: 'text', text: `Failed to read TASK.md for update: ${e}` }],
                };
                eventBus.publish(errorMsg);
                return;
            }

            // Update the checkbox for the completed step
            const lines = taskContent.split('\n');
            let updated = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Match format: "1. [ ] Step description"
                const match = line.match(/^(\d+)\.\s+\[\s*\]\s+(.+)$/);
                if (match) {
                    const lineIndex = parseInt(match[1], 10) - 1;
                    if (lineIndex === stepIndex || match[2].trim() === stepDescription?.trim()) {
                        // Mark as completed: "1. [x] Step description"
                        lines[i] = `${match[1]}. [x] ${match[2]}`;
                        updated = true;
                        break;
                    }
                }
            }

            if (updated) {
                const updatedContent = lines.join('\n');
                await this.mcpClient.callTool({ name: 'FileWriteTool', arguments: { filePath: taskPath, content: updatedContent } } as any);
                publishProgressLog(eventBus, `[TaskDecompositionAgent] Updated TASK.md: step ${stepIndex + 1} completed`, requestContext);
            }
        } catch (e: any) {
            console.error('[TaskDecompositionAgent] Failed to update TASK.md:', e);
            const errorMsg: Message = {
                kind: 'message',
                messageId: uuidv4(),
                role: 'agent',
                parts: [{ kind: 'text', text: `Failed to update TASK.md: ${e.message}` }],
            };
            eventBus.publish(errorMsg);
        }
    }
}