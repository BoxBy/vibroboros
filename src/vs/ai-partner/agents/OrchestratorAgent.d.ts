import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';
import * as mcpServerModule from '@modelcontextprotocol/sdk/server';
import { LLMService } from '../services/LLMService';
import { AuthService } from '../auth_service';
import { ConfigService } from '../config_service';
import { DeveloperLogService } from '../services/DeveloperLogService';
/**
 * @class OrchestratorAgent
 * @description The master agent that coordinates all other agents and services.
 */
export declare class OrchestratorAgent {
    private static readonly AGENT_ID;
    private static readonly SESSIONS_INDEX_KEY;
    private static readonly ACTIVE_SESSION_ID_KEY;
    private static readonly SPECIALIST_AGENTS;
    private readonly _onDidPostMessage;
    readonly onDidPostMessage: vscode.Event<any>;
    private dispatch;
    private mcpServer;
    private llmService;
    private authService;
    private configService;
    private state;
    private diagnosticCollection;
    private developerLogService;
    private chatHistory;
    private llmConversationHistory;
    private alwaysAcceptSuggestions;
    private isAcceptAlwaysActive;
    private isAwaitingPlanConfirmation;
    private currentPlan;
    constructor(dispatch: (message: A2AMessage<any>) => Promise<void>, mcpServer: mcpServerModule.Server, llmService: LLMService, authService: AuthService, configService: ConfigService, state: vscode.Memento, diagnosticCollection: vscode.DiagnosticCollection, developerLogService: DeveloperLogService);
    initialize(): Promise<void>;
    private getSpecialistAgents;
    private loadOrInitializeSession;
    handleSessionChange(): Promise<void>;
    handleUIMessage(message: any): Promise<void>;
    handleA2AMessage(message: A2AMessage<any>): Promise<void>;
    private sendFullSettingsToUI;
    private handleChatAndSpecialistCommands;
    private createAndExecutePlan;
    private runAgentHealthCheck;
    private requestPlanConfirmation;
    private executePlan;
    private routeAndDelegate;
    private addMessageToHistory;
    private getSessionChatHistoryKey;
    private getSessionLlmHistoryKey;
    private saveCurrentChatHistory;
    private saveCurrentLlmHistory;
    private parseThoughtAndUserFacingText;
    private parseAndSendFinalResponse;
    private handleError;
    private updateDiagnostics;
}
