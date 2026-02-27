/**
 * File Edit Transformer
 *
 * Handles file edit A2A messages
 */

import { BaseMessageTransformer } from '../IMessageTransformer';
import { A2A_MIME_TYPES } from '../../../types/A2AMessages';
import { UICommandMessage } from '../../PresentationMessageFactory';
import * as path from 'path';

export class FileEditTransformer extends BaseMessageTransformer {
    readonly mimeType = A2A_MIME_TYPES.FILE_EDIT;

    transform(data: any, contextId?: string): UICommandMessage | null {
        const filePath = data.filePath || '';
        const isUpdate = data.suggestionType === 'modify' || data.suggestionType === 'edit';

        return this.createUICommand('createFileCard', {
            senderName: data.senderName || 'Agent',
            filePath,
            title: data.title || path.basename(filePath),
            relativePath: filePath,
            suggestionType: isUpdate ? 'edit-file' : 'create-file',
            timestamp: data.timestamp || new Date().toISOString(),
            lintSummary: data.lintSummary,
            originalCode: data.originalCode,
            modifiedCode: data.modifiedCode
        }, contextId);
    }
}
