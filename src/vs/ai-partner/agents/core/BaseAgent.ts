import * as vscode from 'vscode';
// removed fs
import * as path from 'path';
import { AgentCard } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';
import { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { LLMService } from '../../services/LLMService';
import { ConfigService } from '../../config_service';
import { DeveloperLogService } from '../../services/DeveloperLogService';
import { getMcpClient } from "../../mcp_client_provider";
import * as mcpClientModule from "@modelcontextprotocol/sdk/client";
import { runAgenticLoop } from '../utils/agentHelpers';
import { CompositionRoot, ServiceIdentifiers } from '../../di/CompositionRoot';
import { IEpisodicMemoryService } from '../../di/interfaces/IEpisodicMemoryService';
import { SymbolicSearchService } from '../../services/SymbolicSearchService';

/**
 * Abstract base class for all agents in the Viper system.
 * Provides access to common services (LLM, Config, Logger, MCP) and utility methods.
 */
export abstract class BaseAgent implements AgentExecutor {
    protected llmService: LLMService;
    protected configService: ConfigService;
    protected mcpClient: mcpClientModule.Client;
    protected logger: DeveloperLogService;

    constructor(protected card: AgentCard) {
        this.llmService = CompositionRoot.resolve<LLMService>(ServiceIdentifiers.LLMService);
        this.configService = CompositionRoot.resolve<ConfigService>(ServiceIdentifiers.ConfigService);
        this.mcpClient = getMcpClient();
        this.logger = CompositionRoot.resolve<DeveloperLogService>(ServiceIdentifiers.Logger);
    }

    protected readonly endpoint: string = '';
    protected outputFormat: 'json' | 'text' = 'json'; // Default to A2A JSON enforcement
    protected cancellationTokenSource?: vscode.CancellationTokenSource;

    protected log(message: string): void {
        this.logger.log(`[${this.card.name}] ${message}`);
        console.log(`[${this.card.name}] ${message}`);
    }

    protected async loadAgentConfig(): Promise<string> {
        return this.configService.getPrompt(this.card.name) || '';
    }

    protected async readWorkspaceFile(filePath: string): Promise<string> {
         try {
            const fileContentResponse = await (this.mcpClient as any).callTool({ name: 'read_file', arguments: { filePath } });
            return (fileContentResponse as any)?.structuredContent?.content 
                || ((fileContentResponse as any)?.content?.find?.((b: any) => b?.type === 'text')?.text) 
                || '';
         } catch {
             try {
                // Fallback to direct FS read
                let absPath = filePath;
                if (!path.isAbsolute(filePath) && vscode.workspace.workspaceFolders) {
                    absPath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, filePath);
                }
                const buf = await vscode.workspace.fs.readFile(vscode.Uri.file(absPath));
                return Buffer.from(buf).toString('utf-8');
             } catch (e) {
                 return '';
             }
         }
    }

    /**
     * Publishes a progress log message using the SDK standard.
     * Wraps utils/sdkProgressHelper.ts functionality.
     * Automatically prefixes the agent name (e.g., "[TestGen]").
     */
    protected logProgress(eventBus: ExecutionEventBus, message: string, requestContext: RequestContext, isStreaming: boolean = false): void {
        const { publishProgressLog } = require('../utils/sdkProgressHelper');
        
        // For streaming thought chunks, we don't want to prefix every chunk with the agent name.
        // We only prefix if it's a full status update or the start of a stream (not easily detectable here without state, 
        // but typically streaming chunks are raw text).
        // Actually, Orchestrator's processProgressLog logic prefixes if sender is set.
        // But for CHUNKS, we want to append.
        
        let finalMessage = message;
        if (!isStreaming) {
             // Standard behavior for full messages
             const prefix = `[${this.card.name}]`;
             finalMessage = message.startsWith('[') ? message : `${prefix} ${message}`;
        }
        
        if (isStreaming) {
             // Publish as status-stream kind (custom extension to SDK helper for now, or just handle in data)
             // We'll reuse publishProgressLog but pass a flag via a new helper or modified one.
             // Since we can't easily modify sdkProgressHelper in this view, we'll manually publish to eventBus.
             
             const streamUpdate: any = {
                kind: 'status-stream', // NEW KIND for streaming
                taskId: requestContext.taskId,
                contextId: requestContext.contextId,
                sender: this.card.name,
                content: message // Raw chunk
            };
            eventBus.publish(streamUpdate);
        } else {
             publishProgressLog(eventBus, finalMessage, requestContext);
        }
    }

    /**
     * Retrieves common LLM configuration including model, keys, endpoint, etc.
     */
    protected async getLLMConfig(agentNameOverride?: string) {
        const agentName = agentNameOverride || this.card.name;
        const model = this.configService.getModel(agentName);
        const apiKeys = await this.configService.getApiKeys();
        const apiKey = apiKeys[0] || '';
        const endpoint = this.configService.getEndpoint();
        const provider = this.configService.getLlmProvider();
        const timeout = Math.min(Math.max(12000, this.configService.getRequestTimeout(agentName) || 60000), 30000);

        return { model, apiKey, apiKeys, endpoint, provider, timeout };
    }

    /**
     * Publishes a standardized A2A error message.
     */
    protected publishA2AError(eventBus: ExecutionEventBus, error: any, contextId?: string): void {
        const { v4: uuidv4 } = require('uuid');

        // Detect MaxTurnError (custom error from agentHelpers)
        const isMaxTurnError = error?.name === 'MaxTurnError' || error?.message?.includes('Max turns');

        if (isMaxTurnError) {
            // Send as a terminating response (response-context) so Orchestrator handles it as a step completion (with error)
            // instead of just a chat message which leaves the step hanging.
            const failureResponse = {
                kind: 'message',
                messageId: uuidv4(),
                role: 'agent',
                parts: [{
                    kind: 'data',
                    mimeType: 'application/vnd.a2a+json',
                    data: {
                        command: 'response-context', // Treat as context response to finalize step
                        payload: {
                            text: `**Max Turns Reached**: The agent stopped after 20 turns to prevent infinite loops. Partial work may be lost.`,
                            senderName: this.card.name,
                            timestamp: new Date().toISOString()
                        },
                        correlation: (error as any).correlation // Pass correlation if attached to error
                    }
                }],
                contextId: contextId,
                senderName: this.card.name
            };
            eventBus.publish(failureResponse as any);
            return;
        }

        const errorMessage = {
            kind: 'message',
            messageId: uuidv4(),
            role: 'agent',
            parts: [{
                kind: 'data',
                mimeType: 'application/vnd.a2a+json',
                data: {
                    error: true,
                    message: error?.message || String(error),
                    stack: error?.stack,
                    code: error?.code
                }
            }],
            contextId: contextId
        };
        eventBus.publish(errorMessage as any);
        this.log(`Published A2A Error: ${error?.message}`);
    }

    /**
     * Wrapper for runLLMLoop utility to reduce imports in child agents.
     */
    protected async runLLMLoopHelper<T>(
        llmCall: (previousError?: string) => Promise<string>,
        parser: (text: string) => T,
        validator: (result: T) => { valid: boolean; error?: string },
        maxRetries: number = 3
    ): Promise<T> {
        const { runLLMLoop } = require('../utils/agentHelpers');
        return runLLMLoop(llmCall, parser, validator, maxRetries, this.logger);
    }
    /**
     * Unified "Function A" Execution Flow.
     * Standardizes the lifecycle: Input -> AgenticLoop -> Output Handling.
     */
    public async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
        // [Cancellation] Init new token source for this execution
        if (this.cancellationTokenSource) {
            this.cancellationTokenSource.dispose();
        }
        this.cancellationTokenSource = new vscode.CancellationTokenSource();

        let userInput = "";
        let loopResult: any = null;
        let modifiedFiles = new Set<string>();

        try {
            userInput = this.extractUserInput(requestContext);
            const correlationId = this.extractCorrelationId(requestContext);

            // 1. Prepare Configuration (Prompt & Tools)
            this.log(`[Execute Debug] Getting System Prompt...`);
            
            // [Tier 5] Senior Intuition Injection (Automatic)
            let seniorIntuition = "";
            let currentAstSignatures: string[] = [];
            
            try {
                const targetFiles = this.extractTargetFiles(requestContext, userInput);
                if (targetFiles.length > 0) {
                    const searchService = SymbolicSearchService.getInstance();
                    const bounds = await searchService.getSymbolBoundsForFiles(targetFiles);
                    currentAstSignatures = [...new Set(bounds.flatMap(b => b.symbols.map(s => s.name)))];
                }
                
                const memory = CompositionRoot.resolve<IEpisodicMemoryService>(ServiceIdentifiers.EpisodicMemoryService);
                seniorIntuition = await memory.getBlendedContext(5, this.card.name, userInput, currentAstSignatures);
            } catch (e) {
                this.log(`[BaseAgent] Failed to fetch Senior Intuition: ${e}`);
            }

            const systemPrompt = await this.getSystemPrompt(userInput, requestContext, seniorIntuition);
            this.log(`[Execute Debug] System Prompt retrieved. Getting Tools...`);
            const tools = await this.getTools(userInput, requestContext);
            this.log(`[Execute Debug] Tools retrieved. Getting LLM Config...`);
            const { model, apiKey, endpoint, provider } = await this.getLLMConfig();
            this.log(`[Execute Debug] LLM Config retrieved.`);

            // 2. Run Standard Agentic Loop
            this.log(`Starting Agentic Loop for task...`);
            
            const proxyMcpClient = {
                callTool: async (params: any) => {
                    const result = await this.mcpClient.callTool(params);
                    const name = params.name;
                    const args = params.arguments;
                    const isFileTool = ['create_file', 'write_to_file', 'edit_file', 'put_file', 'write_file', 'replace_file_content', 'multi_replace_file_content', 'delete_file'].includes(name);
                    
                    if (isFileTool) {
                        const filePath = args.file_path || args.targetFile || args.TargetFile || args.path || args.filePath;
                        const content = args.content || args.code || args.CodeContent || args.data || args.ReplacementContent || "";
                        
                        if (filePath) {
                            const wsPath = this.configService.getWorkspacePath() || '';
                            const absPath = path.isAbsolute(filePath) ? filePath : path.join(wsPath, filePath);
                            modifiedFiles.add(absPath);
                            
                            const action = name.includes('delete') ? 'delete' : (name.includes('edit') || name.includes('update') || name.includes('replace') || name.includes('put') ? 'update' : 'create');

                            eventBus.publish({
                                type: 'resource-action',
                                data: {
                                    action: action,
                                    uri: absPath,
                                    content: content,
                                    timestamp: new Date().toISOString()
                                }
                            } as any);
                        }
                    }
                    return result;
                },
                listTools: async () => this.mcpClient.listTools(),
            };

            loopResult = await runAgenticLoop({
                llmService: this.llmService,
                provider: provider,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userInput }
                ],
                apiKey: apiKey,
                endpoint: endpoint,
                tools: tools,
                model: model,
                agentName: this.card.name,
                mcpClient: proxyMcpClient,
                maxTurns: 100, // Increased limit per user request
                logger: this.logger,
                requireToolUse: false, 
                validator: this.outputFormat === 'json' ? (text) => this.validateA2AResponse(text) : undefined,
                onProgress: (msg: string, isStreaming?: boolean) => this.logProgress(eventBus, msg, requestContext, isStreaming),
                toolHandler: async (name, args) => {
                    // 1. Try Custom Tool Handler (Child Override)
                    const customResult = await this.handleCustomTool(name, args);
                    if (customResult !== undefined) {
                        return customResult;
                    }

                    // 2. Try Standard Core Tools (Internal implementation)
                    const coreResult = await this.handleCoreTools(name, args, requestContext, eventBus, modifiedFiles);
                    if (coreResult !== undefined) {
                        return coreResult;
                    }
                    
                    // 3. Fallback to MCP (Proxy handles event emission)
                    try {
                        return await proxyMcpClient.callTool({ name, arguments: args }); 
                    } catch (error: any) {
                        return `Error executing tool ${name}: ${error.message}`;
                    }
                },
                token: this.cancellationTokenSource?.token
            });

            // 3. Handle Loop Completion (History Hook)
            await this.onLoopComplete(loopResult.messages);

            // 4. Handle Result (Template Hook)
            await this.handleExecutionResult(loopResult.result, requestContext, eventBus, correlationId);

        } catch (error: any) {
             this.publishA2AError(eventBus, error, requestContext?.contextId);
             if (!loopResult) {
                 loopResult = { messages: [], result: `[ERROR] ${error.message}` };
             } else {
                 loopResult.result = `[ERROR] ${error.message}`;
             }
        } finally {
            // 5. Record Episode for Senior Intuition
            try {
                if (userInput && loopResult) {
                    const searchService = SymbolicSearchService.getInstance();
                    const bounds = await searchService.getSymbolBoundsForFiles(Array.from(modifiedFiles));
                    const affectedAstSignatures = [...new Set(bounds.flatMap(b => b.symbols.map(s => s.name)))];
                    
                    const memory = CompositionRoot.resolve<IEpisodicMemoryService>(ServiceIdentifiers.EpisodicMemoryService);
                    
                    let summary = loopResult.result && String(loopResult.result).startsWith('[ERROR]') 
                        ? String(loopResult.result)
                        : `Completed task with ${loopResult.messages?.length || 0} LLM turns.`;
                        
                    if (!summary.startsWith('[ERROR]') && loopResult.result && this.outputFormat === 'json') {
                        try {
                            const parsed = JSON.parse(loopResult.result);
                            if (parsed.summary) summary = parsed.summary;
                            else if (parsed.message) summary = parsed.message;
                        } catch (e) {
                             summary = String(loopResult.result).substring(0, 200);
                        }
                    }

                    await memory.recordEpisode({
                        agentName: this.card.name,
                        contextId: requestContext.contextId,
                        taskId: requestContext.taskId,
                        userInput: userInput,
                        summary: summary,
                        rawLog: JSON.stringify(loopResult.messages || []),
                        affectedAstSignatures: affectedAstSignatures
                    });
                    this.log(`Memory episode recorded with ${affectedAstSignatures.length} AST signatures.`);
                }
            } catch (e) {
                this.log(`[BaseAgent] Failed to record memory episode: ${e}`);
            }
        }
    }

    /**
     * Optional hook called after agentic loop completes.
     * Useful for persisting tool execution history.
     */
    protected async onLoopComplete(_messages: any[]): Promise<void> {
        // No-op by default
    }

    /**
     * Optional: Handle tools internally without MCP.
     * Override this in child class if you have local tools.
     * Return `undefined` if not handled (passthrough to MCP).
     */
    protected async handleCustomTool(_name: string, _args: any): Promise<any | undefined> {
        return undefined;
    }

    /**
     * Handle Standard Core Tools (Create File, Notify User)
     * These are available to ALL agents.
     */
    protected async handleCoreTools(name: string, args: any, requestContext: RequestContext, eventBus: ExecutionEventBus, modifiedFiles?: Set<string>): Promise<any | undefined> {
        // uuidv4 imported at top level

        if (name === 'create_file' || name === 'write_to_file') { // Alias for safety
            const filePath = args.file_path || args.targetFile || args.TargetFile;
            const content = args.content || args.code || args.CodeContent;
            
            if (!filePath || !content) {
                return "Error: Missing file_path or content.";
            }

            const wsPath = this.configService.getWorkspacePath() || '';
            const absPath = path.isAbsolute(filePath) ? filePath : path.join(wsPath, filePath);
            
            if (modifiedFiles) {
                modifiedFiles.add(absPath);
            }

            try {
                await vscode.workspace.fs.writeFile(vscode.Uri.file(absPath), Buffer.from(content, 'utf-8'));
                
                // Emit structured event for UI Block generation
                eventBus.publish({
                    type: 'resource-action',
                    data: {
                        action: 'create',
                        uri: absPath,
                        content: content, // include content for preview/diff if needed
                        timestamp: new Date().toISOString()
                    }
                } as any);

                return `Successfully created file at ${absPath}`;
            } catch (e: any) {
                return `Error creating file: ${e.message}`;
            }
        }

        if (name === 'notify_user') {
            const message = args.message || args.question || args.text;
            if (!message) {
                return "Error: Missing message.";
            }

            const msg = {
                kind: 'message',
                messageId: uuidv4(),
                role: 'agent',
                parts: [{ kind: 'text', text: message }],
                contextId: (requestContext as any)?.contextId
            };
            eventBus.publish(msg as any);
            return `Notification sent to user: "${message}"`;
        }

        if (name === 'manage_context') {
            // Gate behind auto-compaction toggle (default OFF to avoid LLM costs)
            if (!this.configService.getAutoCompactionEnabled()) {
                return `Auto-compaction is disabled. Enable it in Settings → Basic Settings → LLM Context Auto-Compaction.`;
            }

            const mode = args.mode || 'summarize';
            const instructions = args.instructions || '';
            const task = `Perform context management. Mode: ${mode}. ${instructions}`.trim();
            
            this.delegate(eventBus, 'ContextManagementAgent', {
                 task: task,
                 mode: mode
            }, (requestContext as any)?.correlationId);

            return `Requested ContextManagementAgent to perform '${mode}'.`;
        }

        return undefined;
    }

    /**
     * Peer-to-Peer Delegation Helper.
     * Allows any agent to call any other agent.
     */
    protected delegate(eventBus: ExecutionEventBus, targetAgent: string, payload: any, correlationId?: string): void {
        const { v4: uuidv4 } = require('uuid');
        const message = {
            kind: 'message',
            messageId: uuidv4(),
            role: 'agent',
            parts: [{
                kind: 'data',
                mimeType: 'application/vnd.a2a+json',
                data: {
                    sender: this.card.name,
                    targetAgent: targetAgent,
                    correlation: correlationId,
                    ...payload
                }
            }],
            senderName: this.card.name
        };
        // In a real Mesh, we might publish to a specific topic, but here we publish to the bus 
        // and the Orchestrator (or A2A Server) routes it based on 'targetAgent' if implemented,
        // OR we rely on the Orchestrator to see this and re-dispatch.
        // For now, we publish to the shared event bus.
        eventBus.publish(message as any);
        this.log(`Delegated task to ${targetAgent}`);
    }

    // --- Template Hooks (Abstract Methods) ---

    /**
     * Required: Provide the system prompt for the agent's persona.
     * @param userInput The extracted natural language intent from the user.
     * @param requestContext The full request context (for accessing data parts, correlation, etc.).
     * @param seniorIntuition Optional Tier 5 historical intuition data.
     */
    protected abstract getSystemPrompt(userInput: string, requestContext: RequestContext, seniorIntuition?: string): Promise<string>;

    /**
     * Required: Provide the tools available to this agent.
     * @param userInput The extracted natural language intent from the user.
     * @param requestContext The full request context.
     */
    protected abstract getTools(userInput: string, requestContext: RequestContext): Promise<any[]>;

    /**
     * Required: Handle the final result from the Agentic Loop.
     * This is where you process the output (e.g. create files, publish A2A response).
     * @param result The result string (or JSON string) from the loop.
     * @param requestContext The original request context.
     * @param eventBus The event bus to publish messages.
     * @param correlationId The correlation ID passed through the chain.
     */
    protected abstract handleExecutionResult(result: string, requestContext: RequestContext, eventBus: ExecutionEventBus, correlationId?: string): Promise<void>;
    
    public async cancelTask(): Promise<void> {
        if (this.cancellationTokenSource) {
            this.cancellationTokenSource.cancel();
            this.cancellationTokenSource.dispose();
            this.cancellationTokenSource = undefined;
            this.log('Task execution cancelled.');
        }
    }


    // --- Helper Methods ---

    protected validateA2AResponse(text: string): { valid: boolean; error?: string } {
        // [User Request] Log raw output for debugging
        console.log(`[BaseAgent] Raw LLM Output for Validation:\n${text}`);

        if (!text || !text.trim()) {
            return { valid: false, error: "Response is empty." };
        }
        
        // 1. Try Strict Parse
        try {
            const parsed = JSON.parse(text);
            // Fix: Strict Object Check (Reject primitives like numbers/strings)
            if (typeof parsed !== 'object' || parsed === null) {
                 return { valid: false, error: "Response must be a JSON object, not a primitive." };
            }
            return { valid: true };
        } catch (e) {
            // 2. Try Loose Extraction (Markdown/Text wrapping)
            const match = text.match(/\{[\s\S]*\}/);
            if (match) {
                try {
                    const parsed = JSON.parse(match[0]);
                     // Fix: Strict Object Check here too
                    if (typeof parsed !== 'object' || parsed === null) {
                        return { valid: false, error: "Extracted content must be a JSON object." };
                    }
                    return { valid: true }; // Valid JSON found embedded in text
                } catch (innerE: any) {
                     return { valid: false, error: `Found JSON-like block but failed to parse: ${innerE.message}` };
                }
            }
            
            // 3. No JSON found
            return { valid: false, error: `Response must contain a valid JSON object matching the A2A schema (can be wrapped in text/markdown).` };
        }
    }

    protected extractUserInput(ctx: RequestContext): string {
        const anyCtx = ctx as any;
        const incoming = anyCtx?.message || anyCtx?.request?.message || anyCtx?.request || anyCtx;
        
        let parts = Array.isArray(incoming?.parts) ? incoming.parts : (Array.isArray(anyCtx?.parts) ? anyCtx.parts : []);
        
        // 1. Try to extract from Data Part (Structured A2A)
        const dataPart = parts.find((p: any) => p?.kind === 'data');
        if (dataPart?.data) {
            const payload = dataPart.data.payload || dataPart.data;
            // Ensure 'task' is present for the prompt's context
            if (payload.task || payload.question || payload.result) {
                 return JSON.stringify(payload, null, 2);
            }
        }

        // 2. Try to extract from Text Part (Direct User Input)
        const textPart = parts.find((p: any) => p && (p.kind === 'text' || p.type === 'text') && typeof (p.text ?? p.content) === 'string' && String(p.text ?? p.content).trim().length > 0 && String(p.text ?? p.content).trim() !== 'N/A');
        let content = textPart ? String((textPart as any).text ?? (textPart as any).content).trim() : '';
        
        // 3. Fallback extraction logic
        if (!content || content === 'N/A') {
            const dataPart = parts.find((p: any) => p?.kind === 'data');
            if (dataPart?.data?.payload?.task) {
                content = dataPart.data.payload.task;
            } else if (dataPart?.data?.task) {
                content = dataPart.data.task;
            } else if (dataPart?.data?.content) {
                content = dataPart.data.content;
            } else if (dataPart?.data?.goal) {
                content = dataPart.data.goal;
            }
        }

        if ((!content || content === 'N/A') && incoming?.payload?.task) {
            content = incoming.payload.task;
        }

        content = content && content !== 'N/A' ? content : "Process this request.";

        // Augmented context if it was raw text (legacy path)
        try {
            const dataPart = parts.find((p: any) => p?.kind === 'data');
            const payload = dataPart?.data?.payload || dataPart?.data || incoming?.payload || {};

            const contextMsg = payload.context || payload.reason;
            const targetFile = payload.targetFile || payload.target_file;
            const relatedFiles = payload.relatedFiles || payload.related_files;

            if (contextMsg || targetFile || (Array.isArray(relatedFiles) && relatedFiles.length > 0)) {
                content += `\n\n--- Context ---\n`;
                if (contextMsg) {
                    content += `Note: ${contextMsg}\n`;
                }
                if (targetFile) {
                    content += `Target File: ${targetFile}\n`;
                }
                if (Array.isArray(relatedFiles) && relatedFiles.length > 0) {
                    content += `Related Files: ${relatedFiles.join(', ')}\n`;
                }
            }
        } catch (e) {
            // Ignore augmentation errors
        }
        
        return content;
    }

    protected extractTargetFiles(ctx: RequestContext, textContent: string): string[] {
        const files: string[] = [];
        const anyCtx = ctx as any;
        const incoming = anyCtx?.message || anyCtx?.request?.message || anyCtx?.request || anyCtx;
        
        try {
            const parts = Array.isArray(incoming?.parts) ? incoming.parts : (Array.isArray(anyCtx?.parts) ? anyCtx.parts : []);
            const dataPart = parts.find((p: any) => p?.kind === 'data');
            const payload = dataPart?.data?.payload || dataPart?.data || incoming?.payload || {};

            const targetFile = payload.targetFile || payload.target_file;
            const relatedFiles = payload.relatedFiles || payload.related_files;

            const wsPath = this.configService.getWorkspacePath() || '';
            const toAbs = (p: string) => path.isAbsolute(p) ? p : path.join(wsPath, p);

            if (targetFile) files.push(toAbs(targetFile));
            if (Array.isArray(relatedFiles)) {
                files.push(...relatedFiles.map(toAbs));
            }
            
            // Extract trailing paths from text as heuristic since prompt texts often inject related files
            const pathRegex = /(?:\/|[a-zA-Z]:\\)(?:[^\s"'<>|]+)/g;
            const matches = textContent.match(pathRegex);
            if (matches) {
                matches.forEach(m => {
                    if (m.includes('.') && !m.endsWith('.')) {
                        files.push(path.isAbsolute(m) ? m : path.join(wsPath, m));
                    }
                });
            }
        } catch (e) {}

        return [...new Set(files)];
    }

    protected extractSender(ctx: RequestContext): string {
        const anyCtx = ctx as any;
        const incoming = anyCtx?.message || anyCtx?.request?.message || anyCtx?.request || anyCtx;
        return incoming?.senderName || incoming?.sender || incoming?.from || 'OrchestratorAgent';
    }

    protected extractCorrelationId(ctx: RequestContext): string | undefined {
        const anyCtx = ctx as any;
        const incoming = anyCtx?.message || anyCtx?.request?.message || anyCtx?.request || anyCtx;
        
        // Check deep in data parts
        const parts = Array.isArray(incoming?.parts) ? incoming.parts : [];
        const dataPart = parts.find((p: any) => p?.kind === 'data');
        if (dataPart?.data?.correlation) {
            return dataPart.data.correlation;
        }

        return incoming?.task?.data?.correlation || incoming?.data?.correlation || (incoming as any)?.correlation;
    }
}
