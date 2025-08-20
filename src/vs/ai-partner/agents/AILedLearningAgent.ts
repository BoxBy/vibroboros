import * as vscode from 'vscode';
import { A2AMessage } from '../interfaces/A2AMessage';

/**
 * @interface FeedbackPayload
 * Defines the structure for user feedback data.
 */
interface FeedbackPayload {
  suggestionId: string;
  suggestionType: 'refactoring' | 'documentation' | string; // Can be extended
  accepted: boolean;
}

/**
 * @class AILedLearningAgent
 * A specialized agent that processes user feedback to build a preference model.
 */
export class AILedLearningAgent {
    private static readonly AGENT_ID = 'AILedLearningAgent';
    private static readonly LEARNING_DATA_KEY = 'aiPartnerLearningData';

    private dispatch: (message: A2AMessage<any>) => void;
    private state: vscode.Memento;

    constructor(dispatch: (message: A2AMessage<any>) => void, state: vscode.Memento) {
        this.dispatch = dispatch;
        this.state = state;
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

        // Get current learning data from storage, or initialize it.
        const learningData = this.state.get<Record<string, number>>(AILedLearningAgent.LEARNING_DATA_KEY, {});

        // Create a key for the specific feedback, e.g., 'refactoring_accepted' or 'documentation_dismissed'.
        const feedbackKey = `${suggestionType}_${accepted ? 'accepted' : 'dismissed'}`;

        // Increment the counter for this feedback type.
        learningData[feedbackKey] = (learningData[feedbackKey] || 0) + 1;

        // Save the updated learning data back to the workspace state.
        this.state.update(AILedLearningAgent.LEARNING_DATA_KEY, learningData);

        console.log(`[${AILedLearningAgent.AGENT_ID}] Updated learning data:`, learningData);
    }
}
