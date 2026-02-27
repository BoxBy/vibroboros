/**
 * Embedding Service Factory
 */

import { TypedServiceFactory } from '../IServiceFactory';
import { EmbeddingService } from '../../EmbeddingService';

export class EmbeddingServiceFactory extends TypedServiceFactory<EmbeddingService> {
    readonly key = 'IEmbeddingService';
    readonly aliases = ['EmbeddingService'];

    create(): EmbeddingService {
        return EmbeddingService.getInstance();
    }
}
