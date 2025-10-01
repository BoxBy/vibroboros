import { AgentExecutor, AgentCard, Task, TaskStatus, StreamEvent, GetRequest, SendMessageRequest, TaskArtifact } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';
import { getMcpClient } from "../mcp_client_provider";
import { McpClient } from "@modelcontextprotocol/sdk";
import { ConfigService } from "../config_service";

const taskStore = new Map<string, Task>();

export class CodeExecutionAgent implements AgentExecutor {
    private mcpClient: McpClient;
    private configService: ConfigService;

    constructor(private card: AgentCard) {
        this.mcpClient = getMcpClient();
        this.configService = ConfigService.getInstance();
    }

    getAgentCard(): Promise<AgentCard> {
        return Promise.resolve(this.card);
    }

    // ... (rest of the methods are the same)
}