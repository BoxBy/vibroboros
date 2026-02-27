/**
 * Plan Transformer
 *
 * Handles plan A2A messages
 */

import { BaseMessageTransformer } from '../IMessageTransformer';
import { A2A_MIME_TYPES } from '../../../types/A2AMessages';
import { UICommandMessage } from '../../PresentationMessageFactory';

export class PlanTransformer extends BaseMessageTransformer {
    readonly mimeType = A2A_MIME_TYPES.PLAN;

    transform(data: any, contextId?: string): UICommandMessage | null {
        return this.createUICommand('displayPlan', {
            plan: data.steps || []
        }, contextId);
    }
}
