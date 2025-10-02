// import { AgentExecutor, AgentCard, Task, TaskStatus, StreamEvent, GetRequest, SendMessageRequest, TaskArtifact } from "@a2a-js/sdk";
// import { v4 as uuidv4 } from 'uuid';
// import { getMcpClient } from "../mcp_client_provider";
// import { McpClient } from "@modelcontextprotocol/sdk";
// import { ConfigService } from "../config_service";

// const taskStore = new Map<string, Task>();

// export class CodeExecutionAgent implements AgentExecutor {
//     private mcpClient: McpClient;
//     private configService: ConfigService;

//     constructor(private card: AgentCard) {
//         this.mcpClient = getMcpClient();
//         this.configService = ConfigService.getInstance();
//     }

//     getAgentCard(): Promise<AgentCard> {
//         return Promise.resolve(this.card);
//     }

//     // ... (rest of the methods are the same)
// }

import { A2AMessage } from '../interfaces/A2AMessage';
import { MCPMessage } from '../interfaces/MCPMessage';
import { MCPServer } from '../server/MCPServer';

/**
 * An agent that executes shell commands by calling the TerminalExecutionTool.
 */
export class CodeExecutionAgent {
	private static readonly AGENT_ID = 'CodeExecutionAgent';

	constructor(
		private dispatch: (message: A2AMessage<any>) => Promise<void>,
		private mcpServer: MCPServer
	) {}

	/**
	 * Handles incoming messages from other agents.
	 * @param message The agent-to-agent message.
	 */
	public async handleA2AMessage(message: A2AMessage<{ command: string }>): Promise<void> {
		if (message.type !== 'request-code-execution') {
			return;
		}

		try {
			const mcpRequest: MCPMessage<any> = {
				jsonrpc: '2.0',
				id: '1', // This could be improved with a unique ID
				method: 'tools/call',
				params: { name: 'TerminalExecutionTool', arguments: { command: message.payload.command } }
			};

			const mcpResponse = await this.mcpServer.handleRequest(mcpRequest);
			const rawContent = mcpResponse.result?.content?.[0]?.text || `Error or no output from command: ${message.payload.command}`;

			await this.dispatch({
				sender: CodeExecutionAgent.AGENT_ID,
				recipient: 'OrchestratorAgent',
				timestamp: new Date().toISOString(),
				type: 'response-code-execution',
				payload: { rawContent }
			});

		} catch (error: any) {
			console.error(`[${CodeExecutionAgent.AGENT_ID}] Error:`, error);
			await this.dispatch({
				sender: CodeExecutionAgent.AGENT_ID,
				recipient: 'OrchestratorAgent',
				timestamp: new Date().toISOString(),
				type: 'response-code-execution',
				payload: { rawContent: `Failed to execute command: ${error.message}` }
			});
		}
	}
}