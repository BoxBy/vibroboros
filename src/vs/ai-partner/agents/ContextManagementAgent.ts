import { SystemPromptFactory } from '../services/SystemPromptFactory';
import { SessionManager } from '../services/SessionManager';
import { LLMService } from '../services/LLMService';
import { ConfigService } from '../config_service';
import { AgentCard, Message } from "@a2a-js/sdk";
import { RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from 'uuid';
import { getCoreLLMTools } from '../services/LLMTools';
import { BaseAgent } from './core/BaseAgent';

export class ContextManagementAgent extends BaseAgent {

    constructor(card: AgentCard) {
        super(card);
    }

    // --- Unified Flow Implementation ---

    protected async getSystemPrompt(userInput: string, requestContext: RequestContext): Promise<string> {
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
                        text: m.content.map((c: any) => c.text).join(' '),
                        timestamp: m.timestamp
                    })), null, 2);
                } else {
                    targetContent = "No active session history found to summarize.";
                }
            } catch (e) {
                targetContent = `Error fetching history: ${e}`;
            }

            // LOGIC-DRIVEN RULE INJECTION
            const configService = this.configService;
            const summarizeRatio = configService.getSummarizeTokenLimit(); // e.g. 0.75

            // User Formula: max_token * summarize_token_limit * 0.7
            const MAX_CONTEXT = 20000; // Ideally fetch from ModelInfo, but keeping alignment for now.
            const targetTokens = Math.floor(MAX_CONTEXT * summarizeRatio * 0.7);
            
            // Heuristic: 12 tokens/line
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

        return await SystemPromptFactory.generate('ContextManagementAgent', 'ContextManagementAgent', assignedComplexity, finalUserInput, {
            excludeHistory,
            targetContent,
            dynamicRules,
            examples
        });
    }

    protected async getTools(userInput: string, requestContext: RequestContext): Promise<any[]> {
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
        eventBus.publish(response);
    }

    public async cancelTask(): Promise<void> {
        // No-op
    }
}