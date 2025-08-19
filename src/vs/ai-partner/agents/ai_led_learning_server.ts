import * as express from 'express';
import { Request, Response } from 'express';
import { AgentCard, MessageSendParams, Task } from '../core_data_structures';
import { InMemoryTaskStore, A2ARequestHandler, RequestContext } from '../a2a_server';
import { AILedLearningExecutor } from './ai_led_learning_executor';
import { v4 as uuid } from 'uuid';

const learningAgentCard: AgentCard = {
    name: "AI-Led Learning Agent",
    description: "An agent that proactively learns from user interactions to suggest improvements.",
    url: "http://localhost:41246/",
    provider: { organization: "Vibroboros" },
    protocolVersion: "0.3.0",
    version: "1.0.0",
    capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: true },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [{
        id: "learn_from_interaction",
        name: "Learn from Interaction",
        description: "Analyzes a user interaction to learn and adapt for future suggestions.",
        tags: ["learning", "ai", "personalization"],
        examples: ["Learn from this command I just used."],
        inputModes: ["text/plain"],
        outputModes: ["text/plain"],
    }],
    supportsAuthenticatedExtendedCard: false,
};

const taskStore = new InMemoryTaskStore();
const agentExecutor = new AILedLearningExecutor();
const requestHandler = new A2ARequestHandler(learningAgentCard, taskStore, agentExecutor);

const app = express();
app.use(express.json());

app.get('/.well-known/agent-card.json', (_req: Request, res: Response) => {
    res.json(requestHandler.agentCard);
});

app.post('/', async (req: Request, res: Response) => {
    const { method, params, id } = req.body;

    if (method === 'getAgentCard') {
        res.json({ jsonrpc: '2.0', id, result: requestHandler.agentCard });
    } else if (method === 'sendMessage') {
        const sendParams = params as MessageSendParams;
        const taskId = uuid();
        const contextId = uuid();

        const initialTask: Task = {
            kind: 'task',
            id: taskId,
            contextId: contextId,
            status: { state: 'submitted', timestamp: new Date().toISOString() },
            history: [sendParams.message],
            artifacts: [],
        };
        await taskStore.set(initialTask);

        const requestContext: RequestContext = {
            taskId,
            contextId,
            userMessage: sendParams.message,
            task: initialTask,
        };

        res.json({ jsonrpc: '2.0', id, result: initialTask });

        // This is a non-blocking call.
        agentExecutor.execute(requestContext, {
            publish: (event) => console.log(`[LearningServer] Event published for task ${taskId}:`, event.kind),
            finished: () => console.log(`[LearningServer] Task ${taskId} finished.`),
        });

    } else if (method === 'getTask') {
        const task = await taskStore.get(params.id);
        if (task) {
            res.json({ jsonrpc: '2.0', id, result: task });
        } else {
            res.json({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Task not found' } });
        }
    } else {
        res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
    }
});

const PORT = 41246;
app.listen(PORT, () => {
    console.log(`[LearningServer] A2A Server started at http://localhost:${PORT}`);
});
