// DebugConsoleMCPServer.ts - MCP Server for VSCode Debug Console

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
} from '@modelcontextprotocol/sdk/types.js';
import * as vscode from 'vscode';

/**
 * MCP Server for VSCode Debug Console and Diagnostics Access
 */
export class DebugConsoleMCPServer {
    private server: Server;
    private diagnosticCollection: Map<string, vscode.Diagnostic[]> = new Map();

    constructor() {
        this.server = new Server(
            {
                name: 'viper-debug-console',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupHandlers();
        this.watchDiagnostics();
    }

    private setupHandlers(): void {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'get_file_diagnostics',
                        description: 'Get compiler/linter errors and warnings for a specific file',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                filePath: {
                                    type: 'string',
                                    description: 'Absolute path to the file',
                                },
                            },
                            required: ['filePath'],
                        },
                    },
                    {
                        name: 'get_all_diagnostics',
                        description: 'Get all diagnostics in the workspace',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                severity: {
                                    type: 'string',
                                    enum: ['error', 'warning', 'info', 'hint', 'all'],
                                    description: 'Filter by severity',
                                },
                            },
                        },
                    },
                    {
                        name: 'analyze_debug_errors',
                        description: 'Analyze and categorize errors from diagnostics',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                filePath: {
                                    type: 'string',
                                    description: 'File to analyze (optional)',
                                },
                            },
                        },
                    },
                ] as Tool[],
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            switch (name) {
                case 'get_file_diagnostics':
                    return this.getFileDiagnostics(args.filePath as string);
                
                case 'get_all_diagnostics':
                    return this.getAllDiagnostics(args.severity as string);
                
                case 'analyze_debug_errors':
                    return this.analyzeDebugErrors(args.filePath as string | undefined);
                
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
        });
    }

    private watchDiagnostics(): void {
        vscode.languages.onDidChangeDiagnostics((event) => {
            for (const uri of event.uris) {
                const diagnostics = vscode.languages.getDiagnostics(uri);
                this.diagnosticCollection.set(uri.fsPath, diagnostics);
            }
        });
    }

    private getFileDiagnostics(filePath: string): any {
        const uri = vscode.Uri.file(filePath);
        const diagnostics = vscode.languages.getDiagnostics(uri);

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    file: filePath,
                    diagnostics: diagnostics.map(d => ({
                        severity: this.getSeverityName(d.severity),
                        message: d.message,
                        line: d.range.start.line + 1,
                        column: d.range.start.character + 1,
                        source: d.source,
                        code: d.code,
                    })),
                    errorCount: diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length,
                    warningCount: diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length,
                }),
            }],
        };
    }

    private getAllDiagnostics(severity: string = 'all'): any {
        const allDiagnostics: any[] = [];

        for (const [filePath, diagnostics] of this.diagnosticCollection.entries()) {
            const filtered = severity === 'all' 
                ? diagnostics
                : diagnostics.filter(d => this.getSeverityName(d.severity).toLowerCase() === severity.toLowerCase());

            if (filtered.length > 0) {
                allDiagnostics.push({
                    file: filePath,
                    count: filtered.length,
                    diagnostics: filtered.map(d => ({
                        severity: this.getSeverityName(d.severity),
                        message: d.message,
                        line: d.range.start.line + 1,
                    })),
                });
            }
        }

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    totalFiles: allDiagnostics.length,
                    files: allDiagnostics,
                }),
            }],
        };
    }

    private analyzeDebugErrors(filePath?: string): any {
        const diagnostics = filePath
            ? vscode.languages.getDiagnostics(vscode.Uri.file(filePath))
            : Array.from(this.diagnosticCollection.values()).flat();

        const analysis = {
            errors: diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error),
            warnings: diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning),
            bySource: new Map<string, number>(),
            commonPatterns: [] as string[],
        };

        // Group by source
        for (const d of diagnostics) {
            const source = d.source || 'unknown';
            analysis.bySource.set(source, (analysis.bySource.get(source) || 0) + 1);
        }

        // Detect common patterns
        const messages = diagnostics.map(d => d.message.toLowerCase());
        if (messages.filter(m => m.includes('cannot find')).length > 3) {
            analysis.commonPatterns.push('Multiple "cannot find" errors - check imports');
        }
        if (messages.filter(m => m.includes('type')).length > 3) {
            analysis.commonPatterns.push('Multiple type errors - check type definitions');
        }

        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    summary: {
                        totalErrors: analysis.errors.length,
                        totalWarnings: analysis.warnings.length,
                        bySource: Object.fromEntries(analysis.bySource),
                        patterns: analysis.commonPatterns,
                    },
                    topErrors: analysis.errors.slice(0, 10).map(e => ({
                        message: e.message,
                        source: e.source,
                    })),
                }),
            }],
        };
    }

    private getSeverityName(severity: vscode.DiagnosticSeverity): string {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error: return 'Error';
            case vscode.DiagnosticSeverity.Warning: return 'Warning';
            case vscode.DiagnosticSeverity.Information: return 'Info';
            case vscode.DiagnosticSeverity.Hint: return 'Hint';
            default: return 'Unknown';
        }
    }

    async start(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.log('[DebugConsoleMCPServer] Started');
    }
}
