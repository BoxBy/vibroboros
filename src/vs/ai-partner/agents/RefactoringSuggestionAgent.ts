import { AgentExecutor, AgentCard, Task, TaskStatus, StreamEvent, GetRequest, SendMessageRequest, TaskArtifact, A2AClient } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';
import { LLMService, LlmMessage } from '../services/LLMService';
import { ConfigService } from '../config_service';
import { UserPreference } from './AILedLearningAgent';
import { getMcpClient } from "../mcp_client_provider";
import { McpClient } from "@modelcontextprotocol/sdk";

const taskStore = new Map<string, Task>();

export class RefactoringSuggestionAgent implements AgentExecutor {
    private llmService: LLMService;
    private configService: ConfigService;
    private learningAgentClient: A2AClient;
    private mcpClient: McpClient;

    constructor(private agentBaseUrl: string, private card: AgentCard) {
        this.llmService = LLMService.getInstance();
        this.configService = ConfigService.getInstance();
        this.learningAgentClient = new A2AClient({ baseUrl: `${this.agentBaseUrl}/agent/ai-led-learning` });
        this.mcpClient = getMcpClient();
    }

    getAgentCard(): Promise<AgentCard> {
        return Promise.resolve(this.card);
    }

    // ... (rest of the methods are the same)
}