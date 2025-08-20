import { A2AMessage } from '../interfaces/A2AMessage';
import { CodeSummary } from '../interfaces/CodeData';

/**
 * @class CodeAnalysisAgent
 * Responsible for parsing source code, generating summaries, and building call graphs.
 */
export class CodeAnalysisAgent {
    private static readonly AGENT_ID = 'CodeAnalysisAgent';
    private dispatch: (message: A2AMessage<any>) => void;

    constructor(dispatch: (message: A2AMessage<any>) => void) {
        this.dispatch = dispatch;
    }

    /**
     * Handles incoming A2A messages, such as a request to analyze a file.
     * @param message The A2A message to process.
     */
    public handleA2AMessage(message: A2AMessage<{ filePath: string }>): void {
        console.log(`[${CodeAnalysisAgent.AGENT_ID}] Received message:`, message);

        if (message.type === 'request-code-analysis') {
            this.analyzeCode(message.payload.filePath);
        }
    }

    /**
     * Analyzes the code in a given file and sends back a summary.
     * @param filePath The absolute path of the file to analyze.
     */
    private analyzeCode(filePath: string): void {
        console.log(`[${CodeAnalysisAgent.AGENT_ID}] Analyzing file:`, filePath);
        // In a real implementation, this would involve parsing the file
        // using an AST to generate a summary and call graph.

        const summary: CodeSummary = {
            filePath,
            language: 'typescript',
            description: `A summary for ${filePath}`,
            declarations: ['ClassA', 'FunctionB'],
            dependencies: ['../interfaces/A2AMessage'],
        };

        // Dispatch the summary back to the orchestrator.
        this.dispatch({
            sender: CodeAnalysisAgent.AGENT_ID,
            recipient: 'OrchestratorAgent',
            timestamp: new Date().toISOString(),
            type: 'response-code-summary',
            payload: summary,
        });
    }
}
