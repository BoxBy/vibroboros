import { SessionManager } from '../services/SessionManager';
import { EpisodicMemoryService } from '../services/EpisodicMemoryService';
import { AgentCard, Message } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from 'uuid';
import { getCoreLLMTools } from '../services/LLMTools';
import { BaseAgent } from './core/BaseAgent';
import { CompositionRoot, ServiceIdentifiers } from '../di/CompositionRoot';
import { ISystemPromptFactory } from '../di/interfaces/ISystemPromptFactory';

export class ContextManagementAgent extends BaseAgent {
    private promptFactory: ISystemPromptFactory;

    constructor(card: AgentCard) {
        super(card);
        this.promptFactory = CompositionRoot.resolve<ISystemPromptFactory>(ServiceIdentifiers.SystemPromptFactory);
    }

    // --- Unified Flow Implementation ---

    protected async getSystemPrompt(userInput: string, requestContext: RequestContext, seniorIntuition?: string): Promise<string> {
        // 1. Extract Complexity
        const complexityMatch = userInput.match(/Complexity Level (\d+)/);
        const assignedComplexity = complexityMatch ? parseInt(complexityMatch[1], 10) : 30; // Default to Lv 1 (Simple)

        // 2. Generate Prompt via Factory
        let targetContent = '';
        let excludeHistory = false;
        let dynamicRules: string[] = [];
        let examples = '';

        // Extract payload if present (passed via BaseAgent delegation)
        const anyCtx = requestContext as any;
        const payload = anyCtx?.request?.message?.parts?.find((p: any) => p.kind === 'data')?.data 
                     || anyCtx?.message?.parts?.find((p: any) => p.kind === 'data')?.data;

        if (payload?.mode === 'summarize' || payload?.task?.includes('summarize')) {
            // User Correction: A2A calls SHOULD retain their own history (context of the request).
            // excludeHistory = true; // Removed
            
            try {
                // Fetch Active Session History from SessionManager
                const sessionManager = SessionManager.getInstance();
                const state = sessionManager.getState();
                if (state && state.messages) {
                    targetContent = JSON.stringify(state.messages.map(m => ({
                        role: m.author,
                        sender: m.senderName,
                        text: Array.isArray(m.content) 
                            ? (m.content as any[]).map((c: any) => c.text || c.content || '').join(' ')
                            : (m.content || ''),
                        thought: (m as any).thought || '', // Preserve the reasoning/thinking process
                        timestamp: m.timestamp
                    })), null, 2);
                } else {
                    targetContent = "No active session history found to summarize.";
                }
            } catch (e) {
                targetContent = `Error fetching history: ${e}`;
            }

            // Dynamic Threshold Integration
            const configService = this.configService;
            const summarizeRatio = configService.getSummarizeTokenLimit(); // percentage (e.g. 0.75)
            const modelMax = configService.getAgentModelMaxContext() || 32768; // Fallback to reasonable default
            
            // Calculate target tokens based on model capacity and user preference
            const targetTokens = Math.floor(modelMax * summarizeRatio);
            
            // Heuristic refinement: 12 tokens/line
            const SAFE_LINES = Math.max(50, Math.floor(targetTokens / 12));

            dynamicRules.push(`**Line Limit**: When reading files for summarization, YOU MUST READ NO MORE THAN ${SAFE_LINES} LINES per file (Calculated Limit: ${targetTokens} tokens).`);

            examples = `
## EXAMPLES (Dynamic Injection)
### Session Summarization (Lv 2)
- **Goal**: Summarize active session work.
- **Action**:
  - 1. Read Active Chat History (Target Content provided below).
  - 2. (Optional) Read \`summary_history.md\` to see previous context.
  - 3. Generate concise summary.
  - 4. Append to \`.agent/summary_history.md\`.
`;
        }


        let finalUserInput = userInput;
        if (payload && Object.keys(payload).length > 0) {
             finalUserInput = JSON.stringify(payload, null, 2);
        }

        return await this.promptFactory.generate('ContextManagementAgent', 'ContextManagementAgent', assignedComplexity, finalUserInput, {
            excludeHistory,
            targetContent,
            dynamicRules,
            examples
        }, seniorIntuition);
    }

    protected async getTools(): Promise<any[]> {
        const { provider } = await this.getLLMConfig();
        // Use standard core tools (read_file, write_to_file, list_dir)
        return getCoreLLMTools(provider);
    }

    protected async handleExecutionResult(result: string, requestContext: RequestContext, eventBus: ExecutionEventBus, correlationId?: string): Promise<void> {
        // A2A Standard Response
        // Actual work (cleaning/summarizing) is done via tool side-effects.
        
        const response: Message = {
            kind: 'message',
            messageId: uuidv4(),
            role: 'agent',
            parts: [{
                kind: 'data',
                mimeType: 'application/vnd.a2a+json',
                data: {
                    toolName: 'ContextManagementAgent',
                    command: 'response-code-execution',
                    payload: {
                        success: true,
                        status: 'ok',
                        message: "Context management task completed.",
                        result: result, // Include actual work output
                        correlation: correlationId
                    }
                }
            }],
            contextId: (requestContext as any)?.contextId
        } as any;
        // Bridge to Episodic Memory for long-term "Wisdom"
        try {
            const episodicMemory = new EpisodicMemoryService();
            const anyCtx = requestContext as any;
            const payload = anyCtx?.request?.message?.parts?.find((p: any) => p.kind === 'data')?.data 
                         || anyCtx?.message?.parts?.find((p: any) => p.kind === 'data')?.data;
            
            if (payload?.mode === 'summarize') {
                // Record the summary as a memory episode
                await episodicMemory.recordEpisode({
                    agentName: 'ContextManagementAgent',
                    contextId: (requestContext as any)?.contextId || uuidv4(),
                    taskId: (requestContext as any)?.taskId || 'summary',
                    summary: result, // The concise summary/wisdom
                    rawLog: `Session Summary Context: ${result}` // Using the result as log snippet
                });
                this.log('Recorded summarization episode to EpisodicMemoryService.');
            }
        } catch (e) {
            this.log(`Failed to record episode: ${e}`);
        }

        eventBus.publish(response);
    }

    public async cancelTask(): Promise<void> {
        // No-op
    }
}