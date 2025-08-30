import * as express from 'express';
import { Request, Response } from 'express';
import { AgentCard, MessageSendParams, Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from '../core_data_structures';
import { InMemoryTaskStore, A2ARequestHandler, RequestContext } from '../a2a_server';
import { DocGenExecutor } from './doc_gen_executor';
import { v4 as uuid } from 'uuid';

// --- Agent Card Definition ---
const docGenAgentCard: AgentCard = {
    name: "Documentation Generation Agent",
    description: "An agent that generates documentation for code snippets.",
    url: "http://localhost:41242/",
    provider: { organization: "Vibroboros" },
    protocolVersion: "0.3.0",
    version: "1.0.0",
    capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: true },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [{
        id: "generate_documentation",
        name: "Generate Documentation",
        description: "Creates a JSDoc comment for a given TypeScript function or class.",
        tags: ["documentation", "typescript", "javascript", "code"],
        examples: ["Document this function: function hello() { console.log('world'); }"],
        inputModes: ["text/plain"],
        outputModes: ["text/plain"],
    }],
    supportsAuthenticatedExtendedCard: false,
};

// --- Server Setup ---
const taskStore = new InMemoryTaskStore();
const agentExecutor = new DocGenExecutor();
const requestHandler = new A2ARequestHandler(docGenAgentCard, taskStore, agentExecutor);

const app = express();
app.use(express.json());

app.post('/', async (req: Request, res: Response) => {
    const { method, params, id } = req.body;

    if (method === 'getAgentCard') {
        res.json({ jsonrpc: '2.0', id, result: requestHandler.agentCard });
    } else if (method === 'sendMessageStream') {
        const sendParams = params as MessageSendParams;
        const requestContext: RequestContext = {
            taskId: uuid(),
            contextId: uuid(),
            userMessage: sendParams.message,
            task: { /* initial task object */ } as Task,
        };
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        agentExecutor.execute(requestContext, {
            publish: (event: Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent) => res.write(JSON.stringify(event) + '\n'),
            finished: () => res.end(),
        });
    } else {
        res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
    }
});

const PORT = 41242;
app.listen(PORT, () => {
    console.log(`[DocGenServer] A2A Server started at http://localhost:${PORT}`);
});
