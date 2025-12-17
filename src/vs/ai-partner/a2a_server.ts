import { DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { AgentExecutor, RequestContext, ExecutionEventBus } from '@a2a-js/sdk/server'; // AgentExecutor는 server에서 임포트
import { A2AExpressApp } from "@a2a-js/sdk/server/express";
import express from "express";
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { ConfigService } from "./config_service";

// Import all agent classes
// Deprecated agents removed
import { TaskDecompositionAgent } from "./agents/TaskDecompositionAgent";
import { TestGenerationAgent } from "./agents/TestGenerationAgent";
import { CodeEditAgent } from "./agents/CodeEditAgent";
import { BugFixAgent } from "./agents/specialized/BugFixAgent";
import { ContextManagementAgent } from "./agents/ContextManagementAgent";
import { DocumentationGenerationAgent } from "./agents/DocumentationGenerationAgent";
import { BrainstormAgent } from "./agents/BrainstormAgent";
import { OrchestratorAgent } from "./agents/OrchestratorAgent";
import { ReadmeGenerationAgent } from "./agents/ReadmeGenerationAgent";

// 누락된 로컬 타입 임포트
import { A2AMessage } from "./interfaces/A2AMessage";
import { Server } from '@modelcontextprotocol/sdk/server';
import { LLMService } from "src/vs/ai-partner/services/LLMService";
import { AuthService } from "src/vs/ai-partner/auth_service";
import { DeveloperLogService } from "src/vs/ai-partner/services/DeveloperLogService";
import { AgentCard } from '@a2a-js/sdk';

// Factory map to construct agents with correct dependencies
const createAgentFactory = (dispatch: (message: A2AMessage<any>) => Promise<void>, mcpServer: Server, llmService: LLMService, authService: AuthService, configService: ConfigService, workspaceState: vscode.Memento, diagnostics: vscode.DiagnosticCollection, devLogService: DeveloperLogService) => ({
    // './agents/CodeAnalysisAgent.ts' removed
    './agents/CodeEditAgent.ts': (card: AgentCard) => new CodeEditAgent(card),
    './agents/ContextManagementAgent.ts': (card: AgentCard) => new ContextManagementAgent(card),
    './agents/DocumentationGenerationAgent.ts': (card: AgentCard) => new DocumentationGenerationAgent(card),
    './agents/BrainstormAgent.ts': (card: AgentCard) => new BrainstormAgent(card, workspaceState),
    './agents/OrchestratorAgent.ts': (card: AgentCard) => new OrchestratorAgent(dispatch, mcpServer, llmService, authService, configService, workspaceState, diagnostics, devLogService),
    './agents/ReadmeGenerationAgent.ts': (card: AgentCard) => new ReadmeGenerationAgent(card),
    // Deprecated factories removed
    './agents/TaskDecompositionAgent.ts': (card: AgentCard) => new TaskDecompositionAgent(card),
    './agents/TestGenerationAgent.ts': (card: AgentCard) => new TestGenerationAgent(card),
    './agents/specialized/BugFixAgent.ts': (card: AgentCard) => new BugFixAgent(card),
});

const DEFAULT_AGENT_CONFIGS: any[] = [
    { path: './agents/OrchestratorAgent.ts', card: { name: 'OrchestratorAgent', description: 'The master agent that coordinates all other agents and services.', capabilities: {} as any } },
    { path: './agents/ContextManagementAgent.ts', card: { name: 'ContextManagementAgent', description: 'Gathers codebase context and performs symbol searches for user queries.', capabilities: {} as any } },
    { path: './agents/CodeEditAgent.ts', card: { name: 'CodeEditAgent', description: 'Creates, modifies files, and adds inline documentation comments/docstrings while preserving original code. Do NOT use for external documentation files.', capabilities: {} as any } },
    { path: './agents/DocumentationGenerationAgent.ts', card: { name: 'DocumentationGenerationAgent', description: 'Generates external documentation files (Markdown, docs/ folder). NOT for inline comments.', capabilities: {} as any } },
    { path: './agents/ReadmeGenerationAgent.ts', card: { name: 'ReadmeGenerationAgent', description: 'Generates or refreshes README.md from project context.', capabilities: {} as any } },
    // Deprecated configs removed
    { path: './agents/TaskDecompositionAgent.ts', card: { name: 'TaskDecompositionAgent', description: 'Breaks tasks into steps.', capabilities: {} as any } },
    { path: './agents/BrainstormAgent.ts', card: { name: 'BrainstormAgent', description: 'Brainstorms ideas and approaches.', capabilities: {} as any } },
    { path: './agents/specialized/BugFixAgent.ts', card: { name: 'BugFixAgent', description: 'Analyzes and fixes bugs in the codebase.', capabilities: {} as any } }
];

export const startA2AServer = async (context: vscode.ExtensionContext, _agentBaseUrl: string, dispatch: (message: A2AMessage<any>) => Promise<void>, mcpServer: Server, llmService: LLMService, authService: AuthService, configService: ConfigService, diagnostics: vscode.DiagnosticCollection, devLogService: DeveloperLogService, orchestratorAgent?: any) => {
    return new Promise(async (resolve, reject) => {
        try {
            const server = express();
            server.use(express.json());
            // HTTP request logger for A2A endpoints
            server.use((req, res, next) => {
                const start = Date.now();
                const pathStr = req.path;
                console.log(`[a2a_server][http] -> ${req.method} ${pathStr}`);
                if (req.body && Object.keys(req.body).length > 0) {
                    try {
                        console.log(`[a2a_server][http] Body keys: ${Object.keys(req.body).join(', ')}`);
                        console.log(`[a2a_server][http] Body preview: ${JSON.stringify(req.body).slice(0, 1000)}`);
                    } catch {}
                }
                res.on('finish', () => {
                    const ms = Date.now() - start;
                    console.log(`[a2a_server][http] <- ${req.method} ${pathStr} ${res.statusCode} ${ms}ms`);
                });
                next();
            });

            const agentFactory = createAgentFactory(dispatch, mcpServer, llmService, authService, configService, context.workspaceState, diagnostics, devLogService);

            const serversConfigPath = path.join(context.extensionPath, '.agent', 'a2a-servers.json');
            console.log('[viper] [a2a_server.ts] Reading agent configs...');
            const serversConfigContent = await fs.readFile(serversConfigPath, 'utf-8');
            let agentConfigs: any[] = JSON.parse(serversConfigContent);

            const registeredAgentNames = new Set(agentConfigs.map(config => config.card.name));

            // Add default agents if not already present
            for (const defaultAgent of DEFAULT_AGENT_CONFIGS) {
                if (!registeredAgentNames.has(defaultAgent.card.name)) {
                    agentConfigs.push(defaultAgent);
                    registeredAgentNames.add(defaultAgent.card.name);
                }
            }

            // Ensure OrchestratorAgent is always present
            if (!registeredAgentNames.has('OrchestratorAgent')) {
                const orchestratorConfig = DEFAULT_AGENT_CONFIGS.find(config => config.card.name === 'OrchestratorAgent');
                if (orchestratorConfig) {
                    agentConfigs.push(orchestratorConfig);
                }
            }

            // Filter out OrchestratorAgent from the list of agents to be registered on the A2A server
            // OrchestratorAgent is handled separately in extension.ts but we intercept tool-code messages to it
            const agentsToRegister = agentConfigs.filter(config => config.card.name !== 'OrchestratorAgent');

            console.log('[viper] [a2a_server.ts] Setting up agent routes...');
            for (const config of agentsToRegister) {
                const factory = (agentFactory as any)[config.path];
                if (factory) {
                    const taskStore = new InMemoryTaskStore();
                    // Compute route and set card.url so that clients can discover the endpoint via /card
                    const routePath = `/agent/${config.card.name.replace('Agent', '').toLowerCase()}`;
                    (config.card as any).url = `${_agentBaseUrl}${routePath}`;
                    const agentExecutor = factory(config.card);

                    // Create a wrapper executor that intercepts tool-code messages
                    const wrappedExecutor: AgentExecutor = {
                        async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
                            try {
                                const anyCtx: any = requestContext as any;
                                const msgObj = anyCtx?.message || anyCtx?.request?.message || anyCtx?.request || anyCtx;
                                // SDK Workaround removed as per user instruction
                                // Standard message handling proceeds

                                const keys = Object.keys(msgObj || {});
                                let parts = msgObj?.parts || anyCtx?.parts || anyCtx?.request?.parts;
                                let normalized: any[] = Array.isArray(parts) ? parts.filter(Boolean) : [];

                                // Ensure parts is never empty per SDK standard
                                if (!Array.isArray(normalized) || normalized.length === 0) {
                                    const collectText = (): string => {
                                        try {
                                            // Prefer explicit textual fields
                                            if (typeof (msgObj as any)?.text === 'string' && (msgObj as any).text.trim()) { return (msgObj as any).text.trim(); }
                                            const um = (msgObj as any)?.userMessage || (msgObj as any)?.task || (msgObj as any)?.message;
                                            if (typeof um === 'string' && um.trim()) { return um.trim(); }
                                            if (um && typeof um === 'object') {
                                                // content: [{ text: '...' }]
                                                if (Array.isArray(um.content)) {
                                                    const s = um.content.map((c: any) => (typeof c === 'string' ? c : (c?.text ?? ''))).filter(Boolean).join(' ').trim();
                                                    if (s) { return s; }
                                                }
                                                // description / stepDescription
                                                if (typeof um.description === 'string' && um.description.trim()) { return um.description.trim(); }
                                                if (typeof um.stepDescription === 'string' && um.stepDescription.trim()) { return um.stepDescription.trim(); }
                                                // nested parts -> join texts
                                                if (Array.isArray(um.parts)) {
                                                    const t = um.parts.map((p: any) => (p?.text ?? p?.content ?? '')).filter((v: any) => typeof v === 'string' && v.trim()).join(' ').trim();
                                                    if (t) { return t; }
                                                }
                                            }
                                            // top-level content array
                                            const content = (msgObj as any)?.content ?? anyCtx?.content ?? anyCtx?.request?.content;
                                            if (Array.isArray(content)) {
                                                const s = content.map((c: any) => (typeof c === 'string' ? c : (c?.text ?? ''))).filter(Boolean).join(' ').trim();
                                                if (s) { return s; }
                                            }
                                        } catch {}
                                        return '';
                                    };

                                    const text = collectText();
                                    if (text) {
                                        normalized = [{ kind: 'text', text }];
                                    } else {
                                        // Synthesize minimal informative text. Prefer file path if known; else active editor; else 'N/A'
                                        let synthFile: string | undefined;
                                        try {
                                            synthFile = (msgObj as any)?.task?.data?.filePath || (msgObj as any)?.data?.filePath;
                                            if (!synthFile) {
                                                const candidates = [(msgObj as any)?.task?.parts, (msgObj as any)?.parts, anyCtx?.parts];
                                                for (const pc of candidates) {
                                                    if (Array.isArray(pc)) {
                                                        const dp = pc.find((p: any) => p && p.kind === 'data' && typeof p.mimeType === 'string' && p.mimeType.includes('application/vnd.a2a+json') && p.data && typeof p.data.filePath === 'string');
                                                        if (dp && dp.data.filePath) { synthFile = dp.data.filePath; break; }
                                                    }
                                                }
                                            }
                                        } catch {}
                                        if (!synthFile) {
                                            try { synthFile = vscode.window.activeTextEditor?.document?.fileName || undefined; } catch {}
                                        }
                                        const minimal = synthFile ? `file: ${synthFile}` : 'N/A';
                                        normalized = [{ kind: 'text', text: minimal }];
                                    }

                                    // Try to propagate full data payload (including correlation) when available
                                    try {
                                        let dataPayload: any = (msgObj as any)?.task?.data || (msgObj as any)?.data;
                                        if (!dataPayload) {
                                            const candidates = [(msgObj as any)?.task?.parts, (msgObj as any)?.parts, anyCtx?.parts];
                                            for (const pc of candidates) {
                                                if (Array.isArray(pc)) {
                                                    const dp = pc.find((p: any) => p && p.kind === 'data' && typeof p.mimeType === 'string' && p.mimeType.includes('application/vnd.a2a+json') && p.data);
                                                    if (dp && dp.data) { dataPayload = dp.data; break; }
                                                }
                                            }
                                        }
                                        if (dataPayload) {
                                            normalized.push({ kind: 'data', mimeType: 'application/vnd.a2a+json', data: dataPayload });
                                        } else {
                                            let filePath: string | undefined = (msgObj as any)?.task?.data?.filePath || (msgObj as any)?.data?.filePath;
                                            if (!filePath) {
                                                const candidates = [(msgObj as any)?.task?.parts, (msgObj as any)?.parts, anyCtx?.parts];
                                                for (const pc of candidates) {
                                                    if (Array.isArray(pc)) {
                                                        const dp = pc.find((p: any) => p && p.kind === 'data' && typeof p.mimeType === 'string' && p.mimeType.includes('application/vnd.a2a+json') && p.data && typeof p.data.filePath === 'string');
                                                        if (dp && dp.data.filePath) { filePath = dp.data.filePath; break; }
                                                    }
                                                }
                                            }
                                            if (filePath) {
                                                normalized.push({ kind: 'data', mimeType: 'application/vnd.a2a+json', data: { filePath } });
                                            }
                                        }
                                    } catch {}

                                    // Write back so downstream agents always see parts
                                    (msgObj as any).parts = normalized;
                                    anyCtx.parts = normalized;
                                    if (anyCtx.request) { anyCtx.request.parts = normalized; }
                                }

                                // If parts exist but still missing a2a data payload, append from task.data for robustness.
                                // If still not available, synthesize from text and orchestrator state.
                                try {
                                    const hasA2AData = Array.isArray(normalized) && normalized.some((p: any) => p && p.kind === 'data' && typeof p.mimeType === 'string' && p.mimeType.includes('application/vnd.a2a+json') && p.data);
                                    if (!hasA2AData) {
                                        let fallbackData: any = (msgObj as any)?.task?.data || (msgObj as any)?.data;
                                        if (!fallbackData) {
                                            const candidates = [(msgObj as any)?.task?.parts, (msgObj as any)?.parts, anyCtx?.parts];
                                            for (const pc of candidates) {
                                                if (Array.isArray(pc)) {
                                                    const dp = pc.find((p: any) => p && p.kind === 'data' && typeof p.mimeType === 'string' && p.mimeType.includes('application/vnd.a2a+json') && p.data);
                                                    if (dp && dp.data) { fallbackData = dp.data; break; }
                                                }
                                            }
                                        }
                                        // Synthesize when still missing
                                        if (!fallbackData) {
                                            try {
                                                // Extract plain text to infer query/filePath
                                                const findText = (arr: any[]): string => {
                                                    try { const tp = arr?.find?.((p: any) => p && (p.kind === 'text' || p.type === 'text') && typeof (p.text ?? p.content) === 'string'); return String(tp?.text ?? tp?.content ?? '').trim(); } catch { return ''; }
                                                };
                                                const textFromParts = Array.isArray(normalized) ? findText(normalized) : '';
                                                const textFromMsg = String((msgObj as any)?.userMessage || (msgObj as any)?.task?.description || (msgObj as any)?.text || '').trim();
                                                const nl = textFromParts || textFromMsg || '';
                                                let filePath = '';
                                                if (nl) {
                                                    try {
                                                        const m = nl.match(/['"]([^'"\n\r]+\.[A-Za-z0-9]+)['"]|\b([A-Za-z]:\\[^\s'"\n\r]+\.[A-Za-z0-9]+|[^\s'"\n\r]+\.[A-Za-z0-9]+)\b/);
                                                        filePath = (m?.[1] || m?.[2] || '').trim();
                                                    } catch {}
                                                }
                                                // Correlation from orchestrator
                                                let corr: any = undefined;
                                                try {
                                                    const stepId = (() => {
                                                        try {
                                                            const idx = (orchestratorAgent as any)?.currentStepIndex ?? -1;
                                                            const plan = (orchestratorAgent as any)?.currentPlan || [];
                                                            return (idx >= 0 && idx < plan.length) ? (plan[idx]?.id || '') : '';
                                                        } catch { return ''; }
                                                    })();
                                                    corr = {
                                                        planId: (orchestratorAgent as any)?.planId,
                                                        workflowId: (orchestratorAgent as any)?.planId,
                                                        stepId,
                                                        executionId: (orchestratorAgent as any)?.currentExecutionId,
                                                        runId: (orchestratorAgent as any)?.currentExecutionId,
                                                        sessionId: (orchestratorAgent as any)?.activeSessionId
                                                    };
                                                } catch {}
                                                // As a last resort, use orchestrator's lastAppliedFilePath
                                                try {
                                                    if (!filePath) { filePath = (orchestratorAgent as any)?.lastAppliedFilePath || ''; }
                                                } catch {}
                                                fallbackData = (filePath || corr) ? { query: nl, filePath, correlation: corr } : undefined;
                                            } catch {}
                                        }
                                        if (fallbackData) {
                                            normalized = Array.isArray(normalized) ? normalized : [];
                                            normalized.push({ kind: 'data', mimeType: 'application/vnd.a2a+json', data: fallbackData });
                                            // Write back updated parts
                                            (msgObj as any).parts = normalized;
                                            anyCtx.parts = normalized;
                                            if (anyCtx.request) { anyCtx.request.parts = normalized; }
                                        }
                                    }
                                } catch {}

                                console.log(`[a2a_server] Executing ${config.card.name} with message keys: ${keys.join(', ')}`);
                                console.log(`[a2a_server] ${config.card.name} parts length: ${normalized.length}, first.kind: ${normalized[0]?.kind || normalized[0]?.type}`);
                            } catch {}
                            // Intercept events to handle tool-code messages
                            const originalPublish = eventBus.publish.bind(eventBus);
                            const interceptedEventBus: ExecutionEventBus = {
                                ...eventBus,
                                publish: (event: any) => {
                                    try {
                                        if (config.card.name === 'DocumentationGenerationAgent' && event && event.kind === 'message') {
                                            const cnt = Array.isArray(event.parts) ? event.parts.length : 0;
                                            console.log(`[a2a_server][debug] ${config.card.name} published message with parts=${cnt}`);
                                            if (cnt > 0) {
                                                for (let i = 0; i < event.parts.length; i++) {
                                                    const p = event.parts[i];
                                                    console.log(`[a2a_server][debug] part[${i}] kind=${p?.kind || p?.type} mimeType=${p?.mimeType || 'n/a'} toolName=${p?.toolName || p?.data?.toolName || 'n/a'} hasPayload=${!!(p?.payload || p?.data?.payload)}`);
                                                }
                                            }
                                        }
                                    } catch {}
                                    // Check if this is a message containing an A2A envelope for OrchestratorAgent
                                    if (event.kind === 'message' && event.parts) {
                                        for (const part of event.parts) {
                                            // New recommended path: data part with vnd.a2a+json
                                            const mt = typeof part?.mimeType === 'string' ? String(part.mimeType).toLowerCase() : '';
                                            const isVnd = !!mt && mt.includes('vnd.a2a+json');
                                            const isClarification = !!mt && mt.includes('vnd.clarification-request+json');
                                            const isOrch = !!part?.data && (part.data.toolName === 'OrchestratorAgent');
                                            // Check if this is A2A data (explicit toolName OR has response-code-execution fields)
                                            const isA2AData = isVnd && part?.data && (part.data.success !== undefined || part.data.filePath || part.data.error || part.data.correlation);
                                            
                                            if (part.kind === 'data' && part.data && (isOrch || isA2AData || isClarification)) {
                                                let { toolName, command } = part.data || {};
                                                
                                                // Special handling for clarification requests
                                                if (isClarification) {
                                                    toolName = 'OrchestratorAgent';
                                                    command = 'request-clarification';
                                                }

                                                // If no explicit toolName/command, infer from ResponseBuilder data
                                                const inferredToolName = toolName || 'OrchestratorAgent';
                                                const inferredCommand = command || 'response-code-execution';
                                                let payload = (part.data || {}).payload || part.data || {};
                                                // Enrich correlation if missing (SDK may strip parts/task)
                                                try {
                                                    if (inferredToolName === 'OrchestratorAgent' && payload && !payload.correlation && orchestratorAgent) {
                                                        const stepId = (() => {
                                                            try {
                                                                const idx = (orchestratorAgent as any)?.currentStepIndex ?? -1;
                                                                const plan = (orchestratorAgent as any)?.currentPlan || [];
                                                                return (idx >= 0 && idx < plan.length) ? (plan[idx]?.id || '') : '';
                                                            } catch { return ''; }
                                                        })();
                                                        const corr = {
                                                            planId: (orchestratorAgent as any)?.planId,
                                                            workflowId: (orchestratorAgent as any)?.planId,
                                                            stepId,
                                                            executionId: (orchestratorAgent as any)?.currentExecutionId,
                                                            runId: (orchestratorAgent as any)?.currentExecutionId,
                                                            sessionId: (orchestratorAgent as any)?.activeSessionId
                                                        };
                                                        (payload as any).correlation = corr;
                                                        try { console.log('[a2a_server] Injected correlation into A2A payload for OrchestratorAgent.'); } catch {}
                                                    }
                                                } catch {}
                                                if (inferredToolName === 'OrchestratorAgent') {
                                                    const a2aMessage: A2AMessage<any> = {
                                                        messageId: event.messageId || uuidv4(),
                                                        type: inferredCommand,
                                                        payload: payload || {},
                                                        sender: config.card.name,
                                                        recipient: inferredToolName,
                                                        timestamp: new Date().toISOString()
                                                    };
                                                    console.log(`[a2a_server] Intercepted A2A data message from ${config.card.name}, dispatching to ${inferredToolName} (type=${inferredCommand}, mimeType=${part.mimeType || 'n/a'})`);
                                                    
                                                    // Decoupled dispatch: Use the standard dispatch mechanism
                                                    dispatch(a2aMessage).catch(err => {
                                                        console.error(`[a2a_server] Failed to dispatch A2A message:`, err);
                                                    });


                                                    }
                                                    // Also forward to the original bus so the HTTP handler can complete
                                                    return originalPublish(event);
                                                }

                                            // Legacy path: tool-code part
                                            if (part.kind === 'tool-code' && part.toolName === 'OrchestratorAgent') {
                                                // Enrich correlation if missing
                                                // Legacy correlation injection removed

                                                const a2aMessage: A2AMessage<any> = {
                                                    messageId: event.messageId || uuidv4(),
                                                    type: part.command || 'response-code-execution',
                                                    payload: part.payload || {},
                                                    sender: config.card.name,
                                                    recipient: part.toolName,
                                                    timestamp: new Date().toISOString()
                                                };
                                                console.log(`[a2a_server] Intercepted legacy tool-code message from ${config.card.name}, dispatching to ${part.toolName}`);
                                                dispatch(a2aMessage).catch(err => {
                                                    console.error(`[a2a_server] Failed to dispatch tool-code message:`, err);
                                                });
                                                // Also forward to the original bus so the HTTP handler can complete
                                                return originalPublish(event);
                                            }
                                        }
                                    }
                                    // Handle progress log events - forward ALL logs (SDK standard compliance)
                                    try {
                                        if (event && event.type === 'log' && event.message) {
                                            // SDK standard: do not hide or filter any observations
                                            // Forward ALL log events as A2A messages
                                            const a2aMessage: A2AMessage<any> = {
                                                messageId: uuidv4(),
                                                type: 'log',
                                                payload: { message: event.message, text: event.message },
                                                sender: config.card.name,
                                                recipient: 'OrchestratorAgent',
                                                timestamp: new Date().toISOString()
                                            };
                                            console.log(`[a2a_server] Converting log event from ${config.card.name} to A2A message`);
                                            dispatch(a2aMessage).catch(err => {
                                                console.error(`[a2a_server] Failed to dispatch log A2A message:`, err);
                                            });
                                            // Still publish to original bus
                                            return originalPublish(event);
                                        }
                                    } catch {}
                                    // Bridge plain text messages (without explicit OrchestratorAgent data part) to Orchestrator as response-context
                                    try {
                                        if (event.kind === 'message' && Array.isArray(event.parts)) {
                                            // Check if this message has A2A data (either explicit toolName or vnd.a2a+json mime type)
                                            const hasOrchestratorA2A = event.parts.some((p: any) => p && p.kind === 'data' && p.data && p.data.toolName === 'OrchestratorAgent');
                                            const hasA2AData = event.parts.some((p: any) => p && p.kind === 'data' && (p.mimeType?.includes('vnd.a2a+json') || (p.data && (p.data.success !== undefined || p.data.filePath || p.data.correlation))));

                                            if (!hasOrchestratorA2A && !hasA2AData) {
                                                // Only bridge if NO A2A data at all
                                                const textParts = event.parts.filter((p: any) => p && (p.kind === 'text' || p.type === 'text'));
                                                const text = textParts.map((tp: any) => (tp?.text ?? tp?.content ?? '')).filter((s: any) => typeof s === 'string' && s.trim()).join('\n').trim();
                                                if (text) {
                                                    // Inject correlation from orchestrator if available
                                                    let corr: any = undefined;
                                                    // Legacy correlation injection removed


                                                    const a2aMessage: A2AMessage<any> = {
                                                        messageId: event.messageId || uuidv4(),
                                                        type: 'response-context',
                                                        payload: { response: text, correlation: corr },
                                                        sender: config.card.name,
                                                        recipient: 'OrchestratorAgent',
                                                        timestamp: new Date().toISOString()
                                                    };
                                                    console.log(`[a2a_server] Bridging plain text from ${config.card.name} to OrchestratorAgent (response-context)`);
                                                    dispatch(a2aMessage).catch(err => {
                                                        console.error(`[a2a_server] Failed to dispatch bridged plain text:`, err);
                                                    });
                                                }
                                            }
                                        }
                                    } catch {}
                                    // For non-tool-code messages, publish normally
                                    return originalPublish(event);
                                }
                            };

                            // Execute the agent with intercepted eventBus
                            await agentExecutor.execute(requestContext, interceptedEventBus);
                        },
                        async cancelTask(): Promise<void> { /* no-op */ }
                    };



                    const requestHandler = new DefaultRequestHandler(
                        config.card,
                        taskStore,
                        wrappedExecutor
                    );
                    const appBuilder = new A2AExpressApp(requestHandler);
                    const agentRouter = express.Router();
                    appBuilder.setupRoutes(agentRouter as any);
                    // Ensure Agent Card is available at /card for clients using fromCardUrl
                    agentRouter.get('/card', (_req, res) => {
                        res.json(config.card);
                    });
                    server.use(routePath, agentRouter);
                    console.log(`[viper] [a2a_server.ts] Mounted ${config.card.name} at ${routePath}`);
                } else {
                    console.warn(`[viper] [a2a_server.ts] No factory found for agent: ${config.path}. Skipping.`);
                }
            }

            const port = configService.getA2AServerPort();

            const listener = server.listen(port, '127.0.0.1', () => {
                console.log(`A2A Server listening on localhost:${port}`);
                console.log('Registered agent routes:');
                agentsToRegister.forEach(config => {
                     console.log(`- /agent/${config.card.name.replace('Agent', '').toLowerCase()}`);
                });
                resolve({ close: () => listener.close(), registeredAgentConfigs: agentConfigs });
            });

            listener.on('error', (err) => {
                reject(err);
            });
        } catch (e: any) {
            console.error("Error during activation:", e);
            reject(e);
        }
    });
};