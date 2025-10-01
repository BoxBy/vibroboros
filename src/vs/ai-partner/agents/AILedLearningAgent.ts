
import * as vscode from 'vscode';
import { AgentExecutor, AgentCard, Task, TaskStatus, StreamEvent, GetRequest, SendMessageRequest, TaskArtifact } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';

export type UserPreference = 'positive' | 'negative' | 'neutral';

const taskStore = new Map<string, Task>();

export class AILedLearningAgent implements AgentExecutor {
    private static readonly LEARNING_DATA_KEY = 'aiPartnerLearningData';

    constructor(private state: vscode.Memento, private card: AgentCard) {}

    getAgentCard(): Promise<AgentCard> {
        return Promise.resolve(this.card);
    }

    // ... (rest of the methods are the same)
}
