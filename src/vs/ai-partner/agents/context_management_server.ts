import * as express from 'express';
import { Request, Response } from 'express';
import { AgentCard, MessageSendParams, Task } from '../core_data_structures';
import { InMemoryTaskStore, A2ARequestHandler, RequestContext } from '../a2a_server';
import { ContextManagementExecutor } from './context_management_executor';
import { v4 as uuid } from 'uuid';

const contextAgentCard: AgentCard = {
    name: "Context Management Agent",
    description: "An agent that manages and reports on the active context within the IDE.",
    url: "http://localhost:41245/",
    provider: { organization: "Vibroboros" },
    protocolVersion: "0.3.0",
    version: "1.0.0",
    capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: true },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [{
        id: "get_active_context",
        name: "Get Active Context",
        description: "Reports information about the current IDE context (e.g., open files, selections).",
        tags: ["context", "ide", "state"],
        examples: ["What is the current context?"],
        inputModes: ["text/plain"],
        outputModes: ["text/plain"],
    }],
    supportsAuthenticatedExtendedCard: false,
};

const taskStore = new InMemoryTaskStore();
const agentExecutor = new ContextManagementExecutor();
const requestHandler = new A2ARequestHandler(contextAgentCard, taskStore, agentExecutor);

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

        // This is a non-blocking call, as the agent should execute in the background.
        agentExecutor.execute(requestContext, {
            publish: (event) => console.log(`[ContextServer] Event published for task ${taskId}:`, event.kind),
            finished: () => console.log(`[ContextServer] Task ${taskId} finished.`),
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

const PORT = 41245;
app.listen(PORT, () => {
    console.log(`[ContextServer] A2A Server started at http://localhost:${PORT}`);
});
