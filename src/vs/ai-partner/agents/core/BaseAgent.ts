import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentCard } from "@a2a-js/sdk";
import { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { LLMService } from '../../services/LLMService';
import { ConfigService } from '../../config_service';
import { DeveloperLogService } from '../../services/DeveloperLogService';
import { getMcpClient } from "../../mcp_client_provider";
import * as mcpClientModule from "@modelcontextprotocol/sdk/client";
import { runAgenticLoop, AgenticLoopOptions } from '../utils/agentHelpers';

/**
 * Abstract base class for all agents in the Viper system.
 * Provides access to common services (LLM, Config, Logger, MCP) and utility methods.
 */
export abstract class BaseAgent implements AgentExecutor {
    protected llmService: LLMService;
    protected configService: ConfigService;
    protected mcpClient: mcpClientModule.Client;
    protected logger: DeveloperLogService;

    constructor(protected card: AgentCard, protected state: vscode.Memento) {
        this.llmService = LLMService.getInstance();
        this.configService = ConfigService.getInstance();
        this.mcpClient = getMcpClient();
        this.logger = DeveloperLogService.getInstance();
    }

    /**
     * Main execution method that must be implemented by subclasses.
     */
    abstract execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;

    /**
     * Log a message with the agent's name prefixed.
     */
    protected log(message: string): void {
        this.logger.log(`[${this.card.name}] ${message}`);
    }

    /**
     * Helper to run an agentic loop (LLM + Tools)
     */
    protected async runAgenticLoop(options: Omit<AgenticLoopOptions, 'llmService' | 'mcpClient' | 'logger'>): Promise<string> {
        const config = await this.loadAgentConfig();
        const messages = [...options.messages];

        if (config) {
            const sysIdx = messages.findIndex(m => m.role === 'system');
            if (sysIdx !== -1) {
                messages[sysIdx] = { ...messages[sysIdx], content: messages[sysIdx].content + config };
            } else {
                messages.unshift({ role: 'system', content: config });
            }
        }

        return runAgenticLoop({
            ...options,
            messages,
            llmService: this.llmService,
            mcpClient: this.mcpClient,
            logger: this.logger
        });
    }

    /**
     * Cancel the current task. Default implementation is no-op.
     */
    async cancelTask(): Promise<void> {
        // Default no-op
    }

    /**
     * Loads custom agent configuration from local markdown file.
     * Path: C:\Users\LuTe\.gemini\agents\[AgentName].md
     */
    /**
     * Loads custom agent configuration from workspace markdown file.
     * Path: [WorkspaceRoot]/.gemini/AGENTS.md (or GEMINI.md)
     * Format:
     * # Common
     * ...
     * # [AgentName]
     * ...
     */
    protected async loadAgentConfig(): Promise<string> {
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

            this.log(`Loaded custom configuration from ${loadedPath}`);

            // Parse sections using simple regex/string searching
            // We look for headers like '# Common' or '## Common' regarding the agent name
            const lines = content.split('\n');
            let currentSection = '';
            let commonPrompt = '';
            let agentPrompt = '';

            const agentName = this.card.name;

            for (const line of lines) {
                const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
                if (headerMatch) {
                    currentSection = headerMatch[2].trim();
                    continue;
                }

                if (currentSection.toLowerCase() === 'common') {
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
        } catch (e) {
            this.log(`Failed to load agent config: ${e}`);
        }
        return '';
    }
    /**
     * Robustly parses LLM response text into JSON (or text list).
     * Supported formats:
     * 1. Markdown JSON block (```json ... ```)
     * 2. Bare JSON array ([ ... ])
     * 3. Bare JSON object ({ ... })
     * 4. Plain text lists (1. item, - item) -> converted to string[]
     */
    protected parseLLMResponse(text: string): any {
        if (!text) return null;

        // 1. Try extracting from markdown block
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            try { return JSON.parse(jsonMatch[1]); } catch {}
        }

        // 2. Fallback: try finding first '[' and last ']' (Array)
        const firstBracket = text.indexOf('[');
        const lastBracket = text.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
            const candidate = text.substring(firstBracket, lastBracket + 1);
            try { return JSON.parse(candidate); } catch {}
        }

        // 3. Fallback: try finding first '{' and last '}' (Object)
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const candidate = text.substring(firstBrace, lastBrace + 1);
            try { return JSON.parse(candidate); } catch {}
        }

        // 4. Fallback: Parse plain text lists (bullet points or numbered lists)
        // e.g. "- Task 1", "* Task 2", "1. Task 3"
        // This is useful for TaskDecompositionAgent or BrainstormAgent when strict JSON fails
        const lines = text.split('\n');
        const listItems: string[] = [];
        for (const line of lines) {
            const match = line.match(/^\s*(?:-|\*|\d+\.|\[\s*\]|\[x\])\s+(.+)$/);
            if (match) {
                listItems.push(match[1].trim());
            }
        }
        if (listItems.length > 0) {
            return listItems;
        }

        throw new Error(`No JSON or list structure found in response. Raw text preview: ${text.slice(0, 100)}...`);
    }

    /**
     * Reads a file from the workspace using the MCP FileReadTool.
     * @param filePath Relative or absolute path to the file.
     */
    protected async readWorkspaceFile(filePath: string): Promise<string> {
        try {
            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
            const targetPath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
            
            const result = await this.mcpClient.callTool({
                name: 'FileReadTool',
                arguments: { filePath: targetPath }
            });

            if (result.isError) {
                throw new Error(`Tool execution failed: ${JSON.stringify(result)}`);
            }

            // Extract text content from the result
            const content = result.content;
            if (Array.isArray(content) && content.length > 0) {
                 const textPart = content.find(c => c.type === 'text');
                 return textPart ? textPart.text : '';
            }
            
            return '';
        } catch (e: any) {
            throw new Error(`Failed to read file ${filePath}: ${e.message}`);
        }
    }

    /**
     * Writes content to a file in the workspace using the MCP FileWriteTool.
     * @param filePath Relative or absolute path to the file.
     * @param content Content to write.
     */
    protected async writeWorkspaceFile(filePath: string, content: string): Promise<void> {
        try {
            const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
            const targetPath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
            
            await this.mcpClient.callTool({
                name: 'FileWriteTool',
                arguments: { filePath: targetPath, content }
            });
        } catch (e: any) {
            throw new Error(`Failed to write file ${filePath}: ${e.message}`);
        }
    }

    // --- OOP Helper Methods ---

    /**
     * Publishes a progress log message using the SDK standard.
     * Wraps utils/sdkProgressHelper.ts functionality.
     */
    protected logProgress(eventBus: ExecutionEventBus, message: string, requestContext: RequestContext): void {
        const { publishProgressLog } = require('../utils/sdkProgressHelper');
        publishProgressLog(eventBus, message, requestContext);
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
    protected publishA2AError(eventBus: ExecutionEventBus, error: any, contextId?: string, sender: string = 'OrchestratorAgent'): void {
        const { v4: uuidv4 } = require('uuid');
        const errorMessage = {
            kind: 'message',
            messageId: uuidv4(),
            role: 'agent',
            parts: [{
                kind: 'data',
                mimeType: 'application/vnd.a2a+json',
                data: {
                    toolName: sender,
                    command: 'response-context', // or response-code-execution depending on context, but generic error fits context
                    payload: { 
                        response: `Error: ${error?.message || String(error)}`,
                        requiresUserInput: false,
                        error: true 
                    }
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
}
