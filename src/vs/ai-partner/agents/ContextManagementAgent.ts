import { A2AMessage } from '../interfaces/A2AMessage';

/**
 * @class ContextManagementAgent
 * Responsible for selecting and providing the most relevant context for LLM prompts.
 */
export class ContextManagementAgent {
    private static readonly AGENT_ID = 'ContextManagementAgent';
    private dispatch: (message: A2AMessage<any>) => void;

    constructor(dispatch: (message: A2AMessage<any>) => void) {
        this.dispatch = dispatch;
    }

    /**
     * Handles incoming A2A messages, such as a request for context.
     * @param message The A2A message to process.
     */
    public handleA2AMessage(message: A2AMessage<{ query: string }>): void {
        console.log(`[${ContextManagementAgent.AGENT_ID}] Received message:`, message);

        if (message.type === 'request-context') {
            this.gatherContext(message.payload.query);
        }
    }

    /**
     * Gathers relevant context for a given query or task.
     * @param query A description of the task for which context is needed.
     */
    private gatherContext(query: string): void {
        console.log(`[${ContextManagementAgent.AGENT_ID}] Gathering context for query:`, query);
        // In a real implementation, this would involve searching through various
        // data sources (open files, code summaries, etc.) to find relevant information.

        const context = {
            files: ['/path/to/file1.ts', '/path/to/file2.ts'],
            codeSnippets: ['const x = 1;'],
        };

        // Dispatch the context back to the orchestrator.
        this.dispatch({
            sender: ContextManagementAgent.AGENT_ID,
            recipient: 'OrchestratorAgent',
            timestamp: new Date().toISOString(),
            type: 'response-context',
            payload: context,
        });
    }
}
