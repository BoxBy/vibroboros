
import * as vscode from 'vscode';
import { AgentExecutor, AgentCard, Task, TaskStatus, StreamEvent, GetRequest, SendMessageRequest, TaskArtifact } from "@a2a-js/sdk";
import { v4 as uuidv4 } from 'uuid';
import { A2AMessage } from '../interfaces/A2AMessage';

export type UserPreference = 'positive' | 'negative' | 'neutral';

const taskStore = new Map<string, Task>();

export class AILedLearningAgent implements AgentExecutor {
    private static readonly LEARNING_DATA_KEY = 'aiPartnerLearningData';

    constructor(private state: vscode.Memento, private card: AgentCard) {}

    getAgentCard(): Promise<AgentCard> {
        return Promise.resolve(this.card);
    }

    /**
     * Handles incoming A2A messages, specifically for logging user feedback.
     * @param message The A2A message to process.
     */
    public handleA2AMessage(message: A2AMessage<FeedbackPayload>): void {
        if (message.type !== 'log-user-feedback') {
            return;
        }

        const { suggestionType, accepted } = message.payload;
        console.log(`[${AILedLearningAgent.AGENT_ID}] Received feedback for suggestion type '${suggestionType}': ${accepted ? 'Accepted' : 'Dismissed'}`);

        const learningData = this.state.get<Record<string, number>>(AILedLearningAgent.LEARNING_DATA_KEY, {});
        const feedbackKey = `${suggestionType}_${accepted ? 'accepted' : 'dismissed'}`;
        learningData[feedbackKey] = (learningData[feedbackKey] || 0) + 1;

        this.state.update(AILedLearningAgent.LEARNING_DATA_KEY, learningData);
        console.log(`[${AILedLearningAgent.AGENT_ID}] Updated learning data:`, learningData);
    }

    /**
     * Analyzes stored feedback to determine the user's preference for a suggestion type.
     * This allows other agents to adapt their behavior based on user feedback.
     * @param suggestionType The type of suggestion to analyze (e.g., 'refactoring').
     * @returns A UserPreference ('positive', 'negative', 'neutral').
     */
    public getPreference(suggestionType: string): UserPreference {
        const learningData = this.state.get<Record<string, number>>(AILedLearningAgent.LEARNING_DATA_KEY, {});

        const acceptedKey = `${suggestionType}_accepted`;
        const dismissedKey = `${suggestionType}_dismissed`;

        const acceptedCount = learningData[acceptedKey] || 0;
        const dismissedCount = learningData[dismissedKey] || 0;

        // If the user has dismissed suggestions of this type more than twice, and more often than they accept,
        // their preference is considered negative.
        if (dismissedCount > acceptedCount && dismissedCount > 2) {
            return 'negative';
        }

        // If the user has accepted suggestions more than twice, and more often than they dismiss,
        // their preference is considered positive.
        if (acceptedCount > dismissedCount && acceptedCount > 2) {
            return 'positive';
        }

        // Otherwise, the preference is neutral.
        return 'neutral';
    }
}
