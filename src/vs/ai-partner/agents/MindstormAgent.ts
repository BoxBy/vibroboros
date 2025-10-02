import { AgentExecutor, AgentCard, Task, TaskStatus, GetRequest, SendMessageRequest, TaskArtifact, StreamEvent, A2AClient, LlmMessage } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';
import { LLMService } from '../services/LLMService';
import { ConfigService } from '../config_service';
import { getMcpClient } from "../mcp_client_provider";
import { McpClient } from "@modelcontextprotocol/sdk";
import * as path from 'path';
import * as vscode from 'vscode';

const taskStore = new Map<string, Task>();
const conversationStore = new Map<string, LlmMessage[]>();

export class MindstormAgent implements AgentExecutor {
    private llmService: LLMService;
    private configService: ConfigService;
    private mcpClient: McpClient;
    private taskDecompositionClient: A2AClient;

    constructor(agentBaseUrl: string, private card: AgentCard) {
        this.llmService = LLMService.getInstance();
        this.configService = ConfigService.getInstance();
        this.mcpClient = getMcpClient();
        this.taskDecompositionClient = new A2AClient({ baseUrl: `${agentBaseUrl}/agent/task-decomposition` });
    }

    getAgentCard(): Promise<AgentCard> {
        return Promise.resolve(this.card);
    }

    getTask(req: GetRequest): Promise<Task> {
        const task = taskStore.get(req.taskId);
        if (!task) { throw new Error('Task not found'); }
        return Promise.resolve(task);
    }

    async sendMessage(req: SendMessageRequest): Promise<Task> {
        const taskId = uuidv4();
        const task: Task = { id: taskId, status: TaskStatus.PENDING, request: req, steps: [], artifacts: [] };
        taskStore.set(taskId, task);
        this.processInteraction(task, (event) => { console.log('StreamEvent:', event); });
        return task;
    }

    private async processInteraction(task: Task, stream: (event: StreamEvent) => void): Promise<void> {
        try {
            task.status = TaskStatus.RUNNING;
            taskStore.set(task.id, task);
            stream({ type: 'status-changed', status: TaskStatus.RUNNING });

            const conversationId = task.request.message.metadata?.conversationId as string || uuidv4();
            const currentHistory = conversationStore.get(conversationId) || this.getInitialSystemPrompt();
            
            const userMessage: LlmMessage = { role: 'user', content: task.request.message.content as string };
            currentHistory.push(userMessage);

            const model = this.configService.getModel('MindstormAgent');
            const apiKey = this.configService.getApiKeys()[0] || '';
            const endpoint = this.configService.getEndpoint();

            const llmResponse = await this.llmService.requestLLMCompletion(currentHistory, apiKey, endpoint, [], model);
            let assistantResponse = llmResponse.choices[0]?.message?.content || "I'm sorry, I couldn't process that. Could you rephrase?";

            if (assistantResponse.includes('[END_OF_CONVERSATION]')) {
                stream({ type: 'log', message: 'Sufficient information gathered. Finalizing plan...' });
                assistantResponse = assistantResponse.replace('[END_OF_CONVERSATION]', '').trim();
                currentHistory.push({ role: 'assistant', content: assistantResponse });
                await this.finalizePlan(task, currentHistory, stream);
                conversationStore.delete(conversationId); // Clean up conversation
            } else {
                currentHistory.push({ role: 'assistant', content: assistantResponse });
                conversationStore.set(conversationId, currentHistory);
                task.output = assistantResponse;
                // Add conversationId to the task metadata so the client can continue the conversation
                task.metadata = { ...task.metadata, conversationId };
                task.status = TaskStatus.COMPLETED; // Completed this turn, awaiting user response
                stream({ type: 'log', message: 'Awaiting user response...' });
            }

            taskStore.set(task.id, task);
            stream({ type: 'status-changed', status: task.status });

        } catch (e: any) {
            this.failTask(task, e.message, stream);
        }
    }

    private async finalizePlan(task: Task, history: LlmMessage[], stream: (event: StreamEvent) => void): Promise<void> {
        const finalGoal = `Based on the following conversation, generate a detailed task plan:\n\n${JSON.stringify(history, null, 2)}`;
        
        const decompositionTask = await this.taskDecompositionClient.sendMessage({ message: { content: finalGoal } });
        const subTasks = decompositionTask.artifacts?.find(a => a.type === 'plan')?.data as string[];

        if (!subTasks || subTasks.length === 0) {
            throw new Error('TaskDecompositionAgent failed to create a plan.');
        }

        const planMd = `**Goal:**\n${history[1].content}\n\n**Plan:**\n${subTasks.map(t => `- [ ] ${t}`).join('\n')}`;
        const taskMd = subTasks.map((t, i) => `### Task ${i+1}: ${t}\n\n*Description*\n\n*Acceptance Criteria*`).join('\n\n---\n\n');

        const rootPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
        await this.mcpClient.tool.call({ toolName: 'FileWriteTool', input: { filePath: path.join(rootPath, 'PLAN.md'), content: planMd } });
        await this.mcpClient.tool.call({ toolName: 'FileWriteTool', input: { filePath: path.join(rootPath, 'TASK.md'), content: taskMd } });

        task.output = 'Project plan and tasks have been generated in PLAN.md and TASK.md.';
        task.status = TaskStatus.COMPLETED;
    }

    private getInitialSystemPrompt(): LlmMessage[] {
        return [{
            role: 'system',
            content: `You are an expert project manager AI named Mindstorm. Your goal is to have a conversation with the user to flesh out their project idea. Ask clarifying questions one at a time to understand the scope, features, requirements, and technology stack. When you have enough information to build a detailed plan, end your final summary response with the special token [END_OF_CONVERSATION].`
        }];
    }

    private failTask(task: Task, errorMessage: string, stream: (event: StreamEvent) => void): void {
        task.status = TaskStatus.FAILED;
        task.output = errorMessage;
        taskStore.set(task.id, task);
        stream({ type: 'status-changed', status: TaskStatus.FAILED });
        stream({ type: 'log', message: `Task failed: ${errorMessage}` });
    }
}