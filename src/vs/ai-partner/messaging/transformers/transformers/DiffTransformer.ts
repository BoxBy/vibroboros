/**
 * Diff Transformer
 *
 * Handles diff A2A messages
 */

import { BaseMessageTransformer } from '../IMessageTransformer';
import { A2A_MIME_TYPES } from '../../../types/A2AMessages';
import { UICommandMessage } from '../../PresentationMessageFactory';

export class DiffTransformer extends BaseMessageTransformer {
    readonly mimeType = A2A_MIME_TYPES.DIFF;

    transform(data: any, contextId?: string): UICommandMessage | null {
        return this.createUICommand('displayDiffInChatBubble', {
            filePath: data.filePath,
            title: data.title,
            suggestionType: data.suggestionType,
            originalCode: data.originalCode,
            modifiedCode: data.modifiedCode,
            diffHtml: data.diffHtml,
            addedLines: data.addedLines,
            removedLines: data.removedLines,
            senderName: data.senderName,
            timestamp: data.timestamp
        }, contextId);
    }
}
