import { AgentCard, Message } from "@a2a-js/sdk";
import { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from 'uuid';
import { getMcpClient } from "../mcp_client_provider";
import * as mcpClientModule from "@modelcontextprotocol/sdk/client";

export class SecurityAnalysisAgent implements AgentExecutor {
    private mcpClient: mcpClientModule.Client;

    constructor(private card: AgentCard) {
        this.mcpClient = getMcpClient();
    }

    async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
        // Define sender outside try block for access in catch
        let sender = 'OrchestratorAgent';
        try {
            const anyCtx: any = requestContext as any;
            const incoming = anyCtx?.message || anyCtx?.request?.message || anyCtx?.request || anyCtx;
            
            // Dynamic Routing
            sender = incoming?.senderName || incoming?.sender || incoming?.from || 'OrchestratorAgent';

            const parts = (requestContext as any)?.message?.parts || [];
            const dataPart = parts.find((p: any) => p && p.kind === 'data' && p.mimeType === 'application/vnd.a2a+json');
            const command = (dataPart?.data || {}) as any;
            if (!command || command.type !== 'request-security-analysis') {
                throw new Error(`Unsupported command type: ${command?.type}. Expected 'request-security-analysis'.`);
            }

            const { filePath } = command as { filePath: string };
            if (!filePath) {
                throw new Error('No filePath provided for security analysis.');
            }
            console.log(`[SecurityAnalysisAgent] Performing security analysis on: ${filePath}`);

            const analysisResult = await this.mcpClient.callTool({ 
                name: 'SecurityVulnerabilityTool', 
                arguments: { filePath } 
            } as any);

            // MCP Tool 응답 구조: {content: [...], structuredContent: payload}
            // SecurityVulnerabilityTool의 payload는 {findings: [...]}
            const findings = (analysisResult as any)?.structuredContent?.findings || [];
            const vulnerabilities = findings; // findings를 vulnerabilities로 사용

            let outputText: string;
            if (vulnerabilities && vulnerabilities.length > 0) {
                const dataMessage: Message = {
                    kind: "message",
                    messageId: uuidv4(),
                    role: "agent",
                    parts: [
                        { kind: 'data', data: { type: 'security-vulnerabilities', filePath, vulnerabilities } }
                    ],
                    contextId: requestContext.contextId,
                };
                eventBus.publish(dataMessage);
                outputText = `Found ${vulnerabilities.length} potential vulnerabilities.`;
            } else {
                outputText = 'No security vulnerabilities found.';
            }

            // Use 'request-clarification' to display the analysis result in the chat UI.
            // This ensures visibility as standard text messages might be hidden by 'response-context'.
            const clarificationPayload = {
                question: 'Security analysis completed. Please review the findings below.',
                context: outputText,
                options: ['Proceed', 'Ask follow-up question']
            };

            const finalMessage: Message = {
                kind: "message",
                messageId: uuidv4(),
                role: "agent",
                parts: [{
                    kind: 'data',
                    mimeType: 'application/vnd.a2a+json',
                    data: {
                        toolName: sender, // Dynamic Routing
                        command: 'request-clarification',
                        payload: clarificationPayload
                    }
                }],
                contextId: requestContext.contextId,
            };
            eventBus.publish(finalMessage);

        } catch (e: any) {
            const errorMessage: Message = {
                kind: "message",
                messageId: uuidv4(),
                role: "agent",
                parts: [{ kind: "text", text: `An error occurred during security analysis: ${e.message}` }],
                contextId: requestContext.contextId,
            };
            eventBus.publish(errorMessage);

            // SDK Standard: A2A Error Response for Auto-Retry
            try {
                const anyCtx: any = requestContext as any;
                const incoming = anyCtx?.message || anyCtx?.request?.message || anyCtx?.request || anyCtx;
                const parts = Array.isArray(incoming?.parts) ? incoming.parts : (Array.isArray(anyCtx?.parts) ? anyCtx.parts : []);
                const dataPart = parts.find((p: any) => p && p.kind === 'data' && ((typeof p.mimeType === 'string' && p.mimeType.toLowerCase().includes('application/vnd.a2a+json')) || !p.mimeType));
                const correlation = (dataPart?.data || {}).correlation || incoming?.task?.data?.correlation;

                const errorPayload = {
                    success: false,
                    status: 'error',
                    error: e?.message || 'Unknown error',
                    errorMessage: e?.message || 'Unknown error',
                    correlation,
                    artifacts: []
                };
                const a2aError: Message = {
                    kind: 'message',
                    messageId: uuidv4(),
                    role: 'agent',
                    parts: [{
                        kind: 'data',
                        mimeType: 'application/vnd.a2a+json',
                        data: {
                            toolName: sender,
                            command: 'response-code-execution',
                            payload: errorPayload
                        }
                    }],
                    contextId: (requestContext as any)?.contextId
                } as any;
                eventBus.publish(a2aError as any);
            } catch {}
        } finally {
            eventBus.finished();
        }
    }

    async cancelTask(): Promise<void> {
        // no-op
    }
}
