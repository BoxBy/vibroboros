import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface HealthStatus {
    status: 'healthy' | 'unhealthy' | 'unknown';
    message?: string;
    tools?: string[];
}

export class MCPHealthCheckService {
    private static instance: MCPHealthCheckService;
    private constructor() {}

    private cache: { mcp: Record<string, HealthStatus>; a2a: Record<string, HealthStatus> } | null = null;
    public static getInstance(): MCPHealthCheckService {
        if (!MCPHealthCheckService.instance) {
            MCPHealthCheckService.instance = new MCPHealthCheckService();
        }
        return MCPHealthCheckService.instance;
    }

    public async warmUp(extensionPath: string) {
        console.log('[MCPHealthCheck] Warming up cache...');
        this.cache = await this.checkAllServers(extensionPath, true);
        console.log('[MCPHealthCheck] Warm-up complete.');
    }

    /**
     * Check health of all MCP servers from mcp-servers.json
     */
    public async checkMCPServers(extensionPath: string): Promise<Record<string, HealthStatus>> {
        const result: Record<string, HealthStatus> = {};

        try {
            const mcpConfigPath = path.join(extensionPath, '.agent', 'mcp-servers.json');
            const mcpConfigRaw = await fs.readFile(mcpConfigPath, 'utf-8');
            const mcpConfig = JSON.parse(mcpConfigRaw);

            if (mcpConfig?.mcpServers && typeof mcpConfig.mcpServers === 'object') {
                for (const [serverId, cfg] of Object.entries<any>(mcpConfig.mcpServers)) {
                    result[serverId] = await this.checkMCPServer(serverId, cfg);
                }
            } else if (mcpConfig && typeof mcpConfig === 'object') {
                // Fallback for flat structure
                for (const [serverId, cfg] of Object.entries<any>(mcpConfig)) {
                    if (serverId !== 'mcpServers') {
                         result[serverId] = await this.checkMCPServer(serverId, cfg);
                    }
                }
            }
        } catch (error: any) {
            console.warn('[MCPHealthCheck] Failed to read mcp-servers.json:', error.message);
        }

        return result;
    }

    /**
     * Check health of a single MCP server by actually connecting to it
     */
    private async checkMCPServer(serverId: string, config: any): Promise<HealthStatus> {
        try {
            // 1. Basic configuration validation
            if (!config.command || typeof config.command !== 'string') {
                return {
                    status: 'unhealthy',
                    message: 'Missing command'
                };
            }

            // 2. Try to actually connect to the MCP server
            try {
                // Detect if running on Windows
                const isWindows = process.platform === 'win32';
                let validCommand = config.command;
                if (isWindows && (validCommand === 'npx' || validCommand === 'npm')) {
                    validCommand = `${validCommand}.cmd`;
                }

                // Create transport with timeout
                const transport = new StdioClientTransport({
                    command: validCommand,
                    args: Array.isArray(config.args) ? config.args : [],
                    env: { ...(config.env || {}), ...process.env }, // Merge with process env
                    cwd: config.cwd || undefined,
                    stderr: 'pipe'
                });

                const client = new Client({
                    name: `viper-health-check-${serverId}`,
                    version: '1.0.0',
                }, {
                    capabilities: {}
                });

                // Set up timeout
                const timeoutMs = 5000; // 5 seconds
                const connectPromise = (async () => {
                    try {
                        // Connect
                        await client.connect(transport);

                        // Try to list tools as a health check
                        const result = await client.listTools();
                        
                        // Success!
                        return {
                            success: true,
                            toolCount: Array.isArray(result?.tools) ? result.tools.length : 0,
                            tools: Array.isArray(result?.tools) ? result.tools.map((t: any) => t.name) : []
                        };
                    } finally {
                        // Clean up
                        try {
                            await client.close();
                        } catch {}
                    }
                })();

                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Connection timeout')), timeoutMs);
                });

                const result: any = await Promise.race([connectPromise, timeoutPromise]);

                return {
                    status: 'healthy',
                    message: `Connected (${result.toolCount} tools)`,
                    tools: result.tools
                };

            } catch (error: any) {
                // Connection failed
                const errorMsg = error.message || String(error);
                
                if (errorMsg.includes('timeout')) {
                    return {
                        status: 'unhealthy',
                        message: 'Connection timeout'
                    };
                } else if (errorMsg.includes('ENOENT') || errorMsg.includes('not found')) {
                    return {
                        status: 'unhealthy',
                        message: 'Command not found'
                    };
                } else if (errorMsg.includes('EACCES')) {
                    return {
                        status: 'unhealthy',
                        message: 'Permission denied'
                    };
                } else {
                    return {
                        status: 'unhealthy',
                        message: errorMsg.slice(0, 100) // Truncate long errors
                    };
                }
            }

        } catch (error: any) {
            return {
                status: 'unhealthy',
                message: `Check failed: ${error.message}`
            };
        }
    }

    /**
     * Check health of A2A servers from a2a-servers.json
     */
    public async checkA2AServers(extensionPath: string): Promise<Record<string, HealthStatus>> {
        const result: Record<string, HealthStatus> = {};

        try {
            const a2aConfigPath = path.join(extensionPath, '.agent', 'a2a-servers.json');
            const a2aConfigRaw = await fs.readFile(a2aConfigPath, 'utf-8');
            const a2aConfig = JSON.parse(a2aConfigRaw);

            if (Array.isArray(a2aConfig)) {
                for (const agentConfig of a2aConfig) {
                    const name = agentConfig?.card?.name;
                    if (name) {
                        result[name] = await this.checkA2AServer(agentConfig);
                    }
                }
            }
        } catch (error: any) {
            console.warn('[MCPHealthCheck] Failed to read a2a-servers.json:', error.message);
        }

        return result;
    }

    /**
     * Check health of a single A2A server
     */
    private async checkA2AServer(config: any): Promise<HealthStatus> {
        try {
            const url = config?.card?.url;

            if (!url || typeof url !== 'string') {
                return {
                    status: 'unhealthy',
                    message: 'Missing or invalid URL'
                };
            }

            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                return {
                    status: 'unhealthy',
                    message: 'Invalid URL protocol'
                };
            }

            // Check if URL is reachable (basic HTTP check)
            try {
                const cardUrl = url.endsWith('/card') ? url : `${url}/card`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

                const response = await fetch(cardUrl, {
                    method: 'HEAD',
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    return {
                        status: 'healthy',
                        message: 'Server reachable'
                    };
                } else {
                    return {
                        status: 'unhealthy',
                        message: `Server returned ${response.status}`
                    };
                }
            } catch (error: any) {
                if (error.name === 'AbortError') {
                    return {
                        status: 'unhealthy',
                        message: 'Connection timeout'
                    };
                }
                return {
                    status: 'unhealthy',
                    message: `Connection failed: ${error.message}`
                };
            }

        } catch (error: any) {
            return {
                status: 'unhealthy',
                message: `Check failed: ${error.message}`
            };
        }
    }

    /**
     * Perform health check for all servers (both MCP and A2A)
     */
    public async checkAllServers(extensionPath: string, force: boolean = false): Promise<{
        mcp: Record<string, HealthStatus>;
        a2a: Record<string, HealthStatus>;
    }> {
        if (!force && this.cache) {
            return this.cache;
        }

        const [mcp, a2a] = await Promise.all([
            this.checkMCPServers(extensionPath),
            this.checkA2AServers(extensionPath)
        ]);

        this.cache = { mcp, a2a };
        return this.cache;
    }
}
