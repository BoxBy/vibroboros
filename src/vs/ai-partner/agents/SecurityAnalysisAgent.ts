import { A2AMessage } from '../interfaces/A2AMessage';
import { MCPServer } from '../server/MCPServer';

/**
 * @class SecurityAnalysisAgent
 * A specialized agent that performs security checks on files.
 */
export class SecurityAnalysisAgent {
    private static readonly AGENT_ID = 'SecurityAnalysisAgent';
    private dispatch: (message: A2AMessage<any>) => void;
    private mcpServer: MCPServer;

    constructor(dispatch: (message: A2AMessage<any>) => void, mcpServer: MCPServer) {
        this.dispatch = dispatch;
        this.mcpServer = mcpServer;
    }

    /**
     * Handles the request to perform a security analysis on a file.
     * @param message The A2A message containing the file path.
     */
    public async handleA2AMessage(message: A2AMessage<{ filePath: string }>): Promise<void> {
        if (message.type !== 'request-security-analysis') {
            return;
        }

        const { filePath } = message.payload;
        console.log(`[${SecurityAnalysisAgent.AGENT_ID}] Received security analysis request for:`, filePath);

        try {
            // Use the non-LLM, regex-based tool for a fast scan.
            const analysisResult = await this.mcpServer.handleRequest({
                jsonrpc: '2.0', id: '1', method: 'tools/call',
                params: { name: 'SecurityVulnerabilityTool', arguments: { filePath } }
            });

            const vulnerabilities = analysisResult.result.content;

            // Only dispatch a message if vulnerabilities are actually found.
            if (vulnerabilities && vulnerabilities.length > 0 && vulnerabilities[0].type !== 'text') {
                this.dispatch({
                    sender: SecurityAnalysisAgent.AGENT_ID,
                    recipient: 'OrchestratorAgent',
                    timestamp: new Date().toISOString(),
                    type: 'response-security-analysis',
                    payload: { filePath, issues: vulnerabilities }
                });
            }

        } catch (error: any) {
            console.error(`[${SecurityAnalysisAgent.AGENT_ID}] Error during security analysis:`, error);
            // We typically don't want to bother the user with errors from background tasks.
        }
    }
}
