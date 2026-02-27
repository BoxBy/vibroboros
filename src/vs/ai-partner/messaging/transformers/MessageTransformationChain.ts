/**
 * Message Transformation Chain
 *
 * Implements Chain of Responsibility pattern for message transformation.
 * New transformers can be added without modifying existing code (OCP).
 */

import * as path from 'path';
import { IMessageTransformer } from './IMessageTransformer';
import { UICommandMessage } from '../PresentationMessageFactory';

export class MessageTransformationChain {
    private transformers: IMessageTransformer[] = [];

    /**
     * Add a transformer to the chain
     */
    addTransformer(transformer: IMessageTransformer): void {
        this.transformers.push(transformer);
    }

    /**
     * Transform A2A data by finding the appropriate transformer
     */
    transform(mimeType: string, data: any, contextId?: string): UICommandMessage | null {
        for (const transformer of this.transformers) {
            if (transformer.canTransform(mimeType)) {
                return transformer.transform(data, contextId);
            }
        }
        return null;
    }

    /**
     * Get all registered transformers
     */
    getTransformers(): IMessageTransformer[] {
        return [...this.transformers];
    }
}
