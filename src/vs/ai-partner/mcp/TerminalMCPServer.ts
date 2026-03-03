// TerminalMCPServer.ts - MCP Server for VSCode Terminal Access

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
} from '@modelcontextprotocol/sdk/types.js';
import * as vscode from 'vscode';
import { ConfigService } from '../config_service';
import { CompositionRoot, ServiceIdentifiers } from '../di/CompositionRoot';


/**
 * MCP Server for VSCode Terminal Access
 * Provides tools for agents to execute terminal commands and analyze errors
 */
export class TerminalMCPServer {
    private server: Server;
    private outputBuffer: string[] = [];
    private configService: ConfigService;

    constructor() {
        this.configService = CompositionRoot.resolve<ConfigService>(ServiceIdentifiers.ConfigService);
        this.server = new Server(
            {
                name: 'viper-terminal',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupHandlers();
    }

    private setupHandlers(): void {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'execute_terminal_command',
                        description: 'Execute a command in VSCode integrated terminal and capture output',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                command: {
                                    type: 'string',
                                    description: 'The command to execute',
                                },
                                cwd: {
                                    type: 'string',
                                    description: 'Working directory (optional)',
                                },
                            },
                            required: ['command'],
                        },
                    },
                    {
                        name: 'get_terminal_history',
                        description: 'Get recent terminal output history',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                lines: {
                                    type: 'number',
                                    description: 'Number of recent lines to retrieve (default: 50)',
                                },
                            },
                        },
                    },
                    {
                        name: 'analyze_terminal_errors',
                        description: 'Analyze terminal output for errors and warnings',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                output: {
                                    type: 'string',
                                    description: 'Terminal output to analyze',
                                },
                            },
                            required: ['output'],
                        },
                    },
                ] as Tool[],
            };
        });

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            switch (name) {
                case 'execute_terminal_command':
                    if (!args) { throw new Error('Missing arguments'); }
                    return await this.executeTerminalCommand(args.command as string, args.cwd as string | undefined);
                
                case 'get_terminal_history':
                    return this.getTerminalHistory(args?.lines as number | undefined);
                
                case 'analyze_terminal_errors':
                    if (!args) { throw new Error('Missing arguments'); }
                    return this.analyzeTerminalErrors(args.output as string);
                
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        });
    }

    /**
     * Execute a terminal command with permission check
     */
    private async executeTerminalCommand(command: string, cwd?: string): Promise<any> {
        const permission = this.configService.getTerminalPermission();

        // Permission check
        if (permission === 'always_ask' || (permission === 'agent_decides' && !this.isSafeCommand(command))) {
            const approved = await this.requestUserApproval(command);
            if (!approved) {
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            error: 'User denied terminal command execution',
                            command,
                        }),
                    }],
                };
            }
        }

        // Execute command
        try {
            const output = await this.runCommand(command, cwd);
            this.outputBuffer.push(`$ ${command}\n${output}`);

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: true,
                        command,
                        output,
                    }),
                }],
            };
        } catch (error: any) {
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: false,
                        command,
                        error: error.message,
                    }),
                }],
            };
        }
    }

    /**
     * Check if a command is safe to auto-run
     */
    private isSafeCommand(command: string): boolean {
        const safeCommands = [
            /^npm (test|run|install|ci|list|ls)/,
            /^git (status|log|diff|branch|remote)/,
            /^ls/, /^cat/, /^grep/, /^find/, /^pwd/,
            /^node /, /^python /, /^tsc/,
            /^echo /, /^which /, /^where /,
        ];

        const dangerousPatterns = [
            /rm\s+-rf/, /sudo/, /chmod/, /chown/,
            />/, />>/, // File redirection
            /\|/, // Pipe (can be dangerous)
            /;/, // Command chaining
            /&&/, /\|\|/, // Command chaining
            /curl.*\|.*sh/, // Dangerous piping
            /wget.*\|.*sh/,
        ];

        return safeCommands.some(p => p.test(command)) &&
               !dangerousPatterns.some(p => p.test(command));
    }

    /**
     * Request user approval for command execution
     */
    private async requestUserApproval(command: string): Promise<boolean> {
        const result = await vscode.window.showWarningMessage(
            `Agent wants to execute terminal command:\n\n${command}\n\nAllow this?`,
            { modal: true },
            'Allow Once',
            'Always Allow for Session',
            'Deny'
        );

        // TODO: Implement "Always Allow for Session" logic
        return result === 'Allow Once' || result === 'Always Allow for Session';
    }

    /**
     * Actually run the command
     */
    private async runCommand(command: string, cwd?: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const { exec } = require('child_process');
            const options = cwd ? { cwd } : {};

            exec(command, options, (error: any, stdout: string, stderr: string) => {
                if (error) {
                    reject(new Error(stderr || error.message));
                } else {
                    resolve(stdout || stderr);
                }
            });
        });
    }

    /**
     * Get terminal history
     */
    private getTerminalHistory(lines: number = 50): any {
        const recentOutput = this.outputBuffer.slice(-lines).join('\n---\n');

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    history: recentOutput,
                    totalLines: this.outputBuffer.length,
                }),
            }],
        };
    }

    /**
     * Analyze terminal output for errors
     */
    private analyzeTerminalErrors(output: string): any {
        const errors: Array<{ type: string; message: string; line?: string }> = [];

        const lines = output.split('\n');
        for (const line of lines) {
            // Common error patterns
            if (/error:/i.test(line)) {
                errors.push({ type: 'ERROR', message: line.trim(), line });
            } else if (/warning:/i.test(line)) {
                errors.push({ type: 'WARNING', message: line.trim(), line });
            } else if (/failed/i.test(line)) {
                errors.push({ type: 'FAILURE', message: line.trim(), line });
            } else if (/exception/i.test(line)) {
                errors.push({ type: 'EXCEPTION', message: line.trim(), line });
            }
        }

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    errors,
                    errorCount: errors.filter(e => e.type === 'ERROR').length,
                    warningCount: errors.filter(e => e.type === 'WARNING').length,
                }),
            }],
        };
    }

    /**
     * Start the MCP server
     */
    async start(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.log('[TerminalMCPServer] Started');
    }
}
