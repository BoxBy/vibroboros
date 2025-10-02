import { AgentExecutor, AgentCard, Task, TaskStatus, GetRequest, SendMessageRequest, TaskArtifact, StreamEvent } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';
import { LLMService } from '../services/LLMService';
import { ConfigService } from '../config_service';

const taskStore = new Map<string, Task>();

export class TaskDecompositionAgent implements AgentExecutor {
    private llmService: LLMService;
    private configService: ConfigService;

    constructor(private card: AgentCard) {
        this.llmService = LLMService.getInstance();
        this.configService = ConfigService.getInstance();
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
        this.processDecomposition(task, (event) => { console.log('StreamEvent:', event); });
        return task;
    }

    private async processDecomposition(task: Task, stream: (event: StreamEvent) => void): Promise<void> {
        try {
            task.status = TaskStatus.RUNNING;
            taskStore.set(task.id, task);
            stream({ type: 'status-changed', status: TaskStatus.RUNNING });

            const userGoal = task.request.message.content as string;
            if (!userGoal) {
                throw new Error('No goal provided for decomposition.');
            }

            stream({ type: 'log', message: `Decomposing goal: "${userGoal}"` });

            const systemPrompt = `You are an expert software architect. Your job is to break down a high-level user request into a series of smaller, concrete, and actionable steps for a developer to follow. Respond with a JSON array of strings, where each string is a sub-task. For example: ["Set up the project structure", "Install dependencies", "Implement the database schema"]`;
            const userPrompt = `Decompose the following task: ${userGoal}`;

            const model = this.configService.getModel('TaskDecompositionAgent');
            const apiKey = this.configService.getApiKeys()[0] || '';
            const endpoint = this.configService.getEndpoint();

            const llmResponse = await this.llmService.requestLLMCompletion(
                [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                apiKey, endpoint, [], model
            );

            const responseContent = llmResponse.choices[0]?.message?.content;
            if (!responseContent) {
                throw new Error('LLM failed to generate a task plan.');
            }

            let subTasks: string[] = [];
            try {
                // The model should return a JSON array of strings.
                subTasks = JSON.parse(responseContent);
            } catch (e) {
                stream({ type: 'log', message: 'LLM did not return valid JSON, attempting to parse as a list.' });
                // Fallback for models that return a simple list
                subTasks = responseContent.split('\n').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('[') && !s.startsWith(']'));
            }

            if (subTasks.length === 0) {
                throw new Error('No sub-tasks were generated.');
            }

            const artifact: TaskArtifact = {
                id: uuidv4(),
                taskId: task.id,
                type: 'plan',
                data: subTasks,
                description: `Decomposition plan for: ${userGoal}`
            };
            task.artifacts.push(artifact);
            stream({ type: 'artifact-created', artifact });

            task.status = TaskStatus.COMPLETED;
            task.output = `Successfully decomposed the task into ${subTasks.length} steps.`;
            taskStore.set(task.id, task);
            stream({ type: 'status-changed', status: TaskStatus.COMPLETED });

        } catch (e: any) {
            const errorMessage = e.message || 'An unknown error occurred.';
            task.status = TaskStatus.FAILED;
            task.output = errorMessage;
            taskStore.set(task.id, task);
            stream({ type: 'status-changed', status: TaskStatus.FAILED });
            stream({ type: 'log', message: `Task failed: ${errorMessage}` });
        }
    }
}