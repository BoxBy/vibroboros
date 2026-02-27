/**
 * Presentation Message Factory
 *
 * This factory transforms A2A standard domain messages into UI-specific messages.
 * This layer decouples Agents from UI implementation details.
 *
 * Architecture:
 *   Agent -> A2A Standard Message -> PresentationMessageFactory -> UI Message
 *
 * Refactored to follow SOLID principles:
 * - SRP: Delegates transformation to specialized transformers
 * - OCP: New MIME types can be added via transformer registration
 * - DIP: Depends on IMessageTransformer abstraction
 */

import * as path from 'path';
import { A2AMessage, A2A_MIME_TYPES } from '../types/A2AMessages';
import { MessageTransformationChain } from './transformers/MessageTransformationChain';
import {
    FileEditTransformer,
    DiffTransformer,
    ProgressTransformer,
    PlanTransformer,
    LintSummaryTransformer
} from './transformers/transformers';

// ============================================================================
// UI-Specific Message Types
// ============================================================================

/**
 * UI Command Message - Commands sent to the UI layer
 */
export interface UICommandMessage {
    command: string;
    payload?: any;
    sessionId?: string;
}

/**
 * File Card Payload for UI display
 */
export interface FileCardPayload {
    senderName: string;
    filePath: string;
    title?: string;
    relativePath?: string;
    suggestionType: 'create-file' | 'edit-file';
    timestamp?: string;
    lintSummary?: string;
    originalCode?: string;
    modifiedCode?: string;
}

/**
 * Progress Log Payload for UI display
 */
export interface ProgressLogPayload {
    text: string;
    timestamp?: string;
    level?: 'info' | 'warning' | 'error';
}

/**
 * Response Payload for chat messages
 */
export interface ResponsePayload {
    text: string;
    thought?: string;
    senderName?: string;
    timestamp?: string;
    requiresUserInput?: boolean;
    nextActionSuggestion?: string;
    attachments?: Array<{
        type: 'file' | 'folder' | 'code' | 'mcp' | 'browser';
        uri?: string;
        label: string;
        content?: string;
    }>;
    filePath?: string;
    title?: string;
    suggestionType?: string;
}

/**
 * Plan Step for execution plan display
 */
export interface PlanStep {
    description: string;
    status?: 'pending' | 'running' | 'completed' | 'failed';
}

/**
 * Plan Display Payload
 */
export interface PlanDisplayPayload {
    plan: PlanStep[];
}

/**
 * Diff Display Payload
 */
export interface DiffDisplayPayload {
    filePath: string;
    title?: string;
    suggestionType: string;
    originalCode: string;
    modifiedCode: string;
    diffHtml?: string;
    addedLines?: number;
    removedLines?: number;
    senderName?: string;
    timestamp?: string;
}

// ============================================================================
// Presentation Message Factory
// ============================================================================

export class PresentationMessageFactory {
    private static transformationChain: MessageTransformationChain;

    // Static initialization of transformation chain
    static {
        PresentationMessageFactory.transformationChain = new MessageTransformationChain();
        PresentationMessageFactory.registerDefaultTransformers();
    }

    /**
     * Register default transformers
     * New transformers can be added without modifying this class (OCP)
     */
    private static registerDefaultTransformers(): void {
        PresentationMessageFactory.transformationChain.addTransformer(new FileEditTransformer());
        PresentationMessageFactory.transformationChain.addTransformer(new DiffTransformer());
        PresentationMessageFactory.transformationChain.addTransformer(new ProgressTransformer());
        PresentationMessageFactory.transformationChain.addTransformer(new PlanTransformer());
        PresentationMessageFactory.transformationChain.addTransformer(new LintSummaryTransformer());
    }

    /**
     * Register a custom transformer (extensibility point)
     */
    public static registerTransformer(transformer: any): void {
        PresentationMessageFactory.transformationChain.addTransformer(transformer);
    }

    /**
     * Transforms an A2A standard message into UI command messages
     *
     * @param a2aMessage The A2A standard message from an agent
     * @returns UI command message(s) or null if not transformable
     */
    public static transformToUI(a2aMessage: A2AMessage): UICommandMessage | UICommandMessage[] | null {
        if (!a2aMessage.parts || a2aMessage.parts.length === 0) {
            return null;
        }

        const results: UICommandMessage[] = [];

        for (const part of a2aMessage.parts) {
            if (part.kind !== 'data') {
                continue;
            }

            const dataPart = part as { kind: 'data'; mimeType: string; data: any };
            const command = this.transformDataPart(dataPart.mimeType, dataPart.data, a2aMessage.contextId);

            if (command) {
                if (Array.isArray(command)) {
                    results.push(...command);
                } else {
                    results.push(command);
                }
            }
        }

        return results.length === 0 ? null : (results.length === 1 ? results[0] : results);
    }

    /**
     * Transforms a data part based on MIME type
     * Now uses the transformation chain (OCP compliant)
     */
    private static transformDataPart(mimeType: string, data: any, contextId?: string): UICommandMessage | UICommandMessage[] | null {
        return PresentationMessageFactory.transformationChain.transform(mimeType, data, contextId);
    }

    // ========================================================================
    // Direct UI Message Creation (for backward compatibility)
    // These methods create UI messages directly without A2A transformation
    // ========================================================================

    /**
     * Creates a file card UI message directly
     * Use this for non-agent UI operations (e.g., button clicks)
     */
    public static createFileCard(
        senderName: string,
        filePath: string,
        isUpdate: boolean,
        lintSummary?: string,
        originalCode?: string,
        modifiedCode?: string
    ): UICommandMessage {
        return {
            command: 'createFileCard',
            payload: {
                senderName,
                filePath,
                title: path.basename(filePath),
                suggestionType: isUpdate ? 'edit-file' : 'create-file',
                timestamp: new Date().toISOString(),
                lintSummary,
                originalCode,
                modifiedCode
            } as FileCardPayload
        };
    }

    /**
     * Creates a progress log UI message directly
     */
    public static createProgressLog(text: string, level?: 'info' | 'warning' | 'error'): UICommandMessage {
        return {
            command: 'progressLog',
            payload: {
                text,
                timestamp: new Date().toISOString(),
                level: level || 'info'
            } as ProgressLogPayload
        };
    }

    /**
     * Creates a response UI message directly
     */
    public static createResponse(senderName: string, text: string, options?: Partial<ResponsePayload>): UICommandMessage {
        return {
            command: 'response',
            payload: {
                text,
                senderName,
                timestamp: new Date().toISOString(),
                ...options
            } as ResponsePayload
        };
    }

    /**
     * Creates a status update UI message
     */
    public static createStatusUpdate(text: string, isFinal?: boolean): UICommandMessage {
        return {
            command: 'statusUpdate',
            payload: {
                text,
                final: isFinal || false
            }
        };
    }

    /**
     * Creates a hide diff UI message
     */
    public static createHideDiff(filePath: string): UICommandMessage {
        return {
            command: 'hideDiff',
            payload: { filepath: filePath }
        };
    }

    /**
     * Creates an update plan step UI message
     */
    public static createUpdatePlanStep(index: number, status: 'pending' | 'running' | 'completed' | 'failed'): UICommandMessage {
        return {
            command: 'updatePlanStep',
            payload: { index, status }
        };
    }
}
