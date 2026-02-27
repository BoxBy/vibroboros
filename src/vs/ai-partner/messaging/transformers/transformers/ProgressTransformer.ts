/**
 * Progress Transformer
 *
 * Handles progress A2A messages
 */

import { BaseMessageTransformer } from '../IMessageTransformer';
import { A2A_MIME_TYPES } from '../../../types/A2AMessages';
import { UICommandMessage } from '../../PresentationMessageFactory';

export class ProgressTransformer extends BaseMessageTransformer {
    readonly mimeType = A2A_MIME_TYPES.PROGRESS;

    transform(data: any, contextId?: string): UICommandMessage | null {
        return this.createUICommand('progressLog', {
            text: data.text || '',
            timestamp: data.timestamp,
            level: data.level || 'info'
        }, contextId);
    }
}
