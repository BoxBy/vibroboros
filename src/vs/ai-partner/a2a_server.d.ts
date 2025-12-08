import * as vscode from 'vscode';
import { A2AMessage } from "../interfaces/A2AMessage";
import { MCPServer } from "../server/MCPServer";
import { LLMService } from "../services/LLMService";
import { AuthService } from "../auth_service";
import { DeveloperLogService } from "../services/DeveloperLogService";
export declare function startA2AServer(context: vscode.ExtensionContext, agentBaseUrl: string, dispatch: (message: A2AMessage<any>) => Promise<void>, mcpServer: MCPServer, llmService: LLMService, authService: AuthService, diagnostics: vscode.DiagnosticCollection, devLogService: DeveloperLogService): Promise<{
    close: () => void;
    server: any;
}>;
