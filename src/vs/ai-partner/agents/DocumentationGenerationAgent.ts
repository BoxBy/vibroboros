import { A2AMessage } from '../interfaces/A2AMessage';
import { CodeSummary } from '../interfaces/CodeData';

/**
 * @class DocumentationGenerationAgent
 * Responsible for generating and updating documentation, such as README.md files.
 */
export class DocumentationGenerationAgent {
    private static readonly AGENT_ID = 'DocumentationGenerationAgent';
    private dispatch: (message: A2AMessage<any>) => void;

    constructor(dispatch: (message: A2AMessage<any>) => void) {
        this.dispatch = dispatch;
    }

    /**
     * Handles incoming A2A messages, such as a request to generate documentation.
     * @param message The A2A message to process.
     */
    public handleA2AMessage(message: A2AMessage<{ codeSummary: CodeSummary }>): void {
        console.log(`[${DocumentationGenerationAgent.AGENT_ID}] Received message:`, message);

        if (message.type === 'request-documentation-generation') {
            this.generateDocs(message.payload.codeSummary);
        }
    }

    /**
     * Generates documentation for a given file or project based on its summary.
     * @param summary The code summary to document.
     */
    private generateDocs(summary: CodeSummary): void {
        console.log(`[${DocumentationGenerationAgent.AGENT_ID}] Generating documentation for:`, summary.filePath);
        // In a real implementation, this would analyze the code summary and generate
        // comprehensive documentation in Markdown format.

        const documentation = `# ${summary.filePath}\n\nThis is auto-generated documentation based on the code summary.`;

        // Dispatch the generated documentation back to the orchestrator.
        this.dispatch({
            sender: DocumentationGenerationAgent.AGENT_ID,
            recipient: 'OrchestratorAgent',
            timestamp: new Date().toISOString(),
            type: 'response-documentation-generation',
            payload: { filePath: summary.filePath, documentation },
        });
    }
}
