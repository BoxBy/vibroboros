import * as vscode from 'vscode';
import { ConfigService } from "./config_service";
import { A2AMessage } from "./interfaces/A2AMessage";
import { Server } from '@modelcontextprotocol/sdk/server';
import { LLMService } from "src/vs/ai-partner/services/LLMService";
import { AuthService } from "src/vs/ai-partner/auth_service";
import { DeveloperLogService } from "src/vs/ai-partner/services/DeveloperLogService";
export declare const startA2AServer: (context: vscode.ExtensionContext, _agentBaseUrl: string, dispatch: (message: A2AMessage<any>) => Promise<void>, mcpServer: Server, llmService: LLMService, authService: AuthService, configService: ConfigService, diagnostics: vscode.DiagnosticCollection, devLogService: DeveloperLogService, orchestratorAgent?: any) => Promise<unknown>;
