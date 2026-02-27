/**
 * Lint Summary Transformer
 *
 * Handles lint summary A2A messages
 */

import { BaseMessageTransformer } from '../IMessageTransformer';
import { A2A_MIME_TYPES } from '../../../types/A2AMessages';
import { UICommandMessage } from '../../PresentationMessageFactory';

export class LintSummaryTransformer extends BaseMessageTransformer {
    readonly mimeType = A2A_MIME_TYPES.LINT_SUMMARY;

    transform(data: any, contextId?: string): UICommandMessage | null {
        return this.createUICommand('lintSummary', {
            filePath: data.filePath,
            summary: data.summary,
            errorCount: data.errorCount,
            warningCount: data.warningCount
        }, contextId);
    }
}
