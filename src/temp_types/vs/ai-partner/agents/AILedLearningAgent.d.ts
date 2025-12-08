import * as vscode from 'vscode';
import { AgentCard } from "@a2a-js/sdk";
import { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
export type UserPreference = 'positive' | 'negative' | 'neutral';
export interface FeedbackPayload {
    suggestionType: string;
    accepted: boolean;
}
export declare class AILedLearningAgent implements AgentExecutor {
    private card;
    private state;
    private static readonly LEARNING_DATA_KEY;
    constructor(card: AgentCard, state: vscode.Memento);
    execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void>;
}
