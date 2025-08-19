import * as express from 'express';
import { Request, Response } from 'express';
import { AgentCard, MessageSendParams, Task } from '../core_data_structures';
import { InMemoryTaskStore, A2ARequestHandler, RequestContext } from '../a2a_server';
import { RefactoringSuggestionExecutor } from './refactoring_suggestion_executor';
import { v4 as uuid } from 'uuid';

// --- Agent Configuration ---
const configArg = process.argv[2];
if (!configArg) {
    console.error("Agent configuration not provided!");
    process.exit(1);
}
const config = JSON.parse(Buffer.from(configArg, 'base64').toString('utf8'));

// --- Agent Card Definition ---
const refactoringAgentCard: AgentCard = {
    name: "Refactoring Suggestion Agent",
    description: "An agent that analyzes code and provides refactoring suggestions.",
    url: "http://localhost:41243/",
    provider: { organization: "Vibroboros" },
    protocolVersion: "0.3.0",
    version: "1.0.0",
    capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: true },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [{
        id: "get_refactoring_suggestions",
        name: "Get Refactoring Suggestions",
        description: "Analyzes a block of code and suggests improvements.",
        tags: ["refactoring", "code quality", "typescript"],
        examples: ["Refactor this code for me."],
        inputModes: ["text/plain"],
        outputModes: ["text/plain"],
    }],
    supportsAuthenticatedExtendedCard: false,
};

// --- Server Setup ---
const taskStore = new InMemoryTaskStore();
const agentExecutor = new RefactoringSuggestionExecutor(config);
const requestHandler = new A2ARequestHandler(refactoringAgentCard, taskStore, agentExecutor);

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
            publish: (event) => res.write(JSON.stringify(event) + '\n'),
            finished: () => res.end(),
        });
    } else {
        res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
    }
});

const PORT = 41243;
app.listen(PORT, () => {
    console.log(`[RefactoringServer] A2A Server started at http://localhost:${PORT} with model ${config.model}`);
});
