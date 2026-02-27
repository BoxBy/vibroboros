/**
 * Reranker Service Factory
 */

import { TypedServiceFactory } from '../IServiceFactory';
import { RerankerService } from '../../RerankerService';

export class RerankerServiceFactory extends TypedServiceFactory<RerankerService> {
    readonly key = 'IRerankerService';
    readonly aliases = ['RerankerService'];

    create(): RerankerService {
        return RerankerService.getInstance();
    }
}
