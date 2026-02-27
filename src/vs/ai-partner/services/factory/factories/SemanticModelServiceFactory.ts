/**
 * Semantic Model Service Factory
 */

import { TypedServiceFactory } from '../IServiceFactory';
import { SemanticModelService } from '../../SemanticModelService';
import { DeveloperLogService } from '../../DeveloperLogService';
import type { ServiceContainer } from '../../../di/ServiceContainer';

export class SemanticModelServiceFactory extends TypedServiceFactory<SemanticModelService> {
    readonly key = 'ISemanticModelService';
    readonly aliases = ['SemanticModelService'];

    create(container?: ServiceContainer): SemanticModelService {
        // Try to resolve DeveloperLogService from container
        let developerLogService: DeveloperLogService | undefined;

        if (container && container.has('IDeveloperLogService')) {
            try {
                developerLogService = container.resolve<DeveloperLogService>('IDeveloperLogService');
            } catch (e) {
                console.warn('[SemanticModelServiceFactory] Could not resolve DeveloperLogService:', e);
            }
        }

        // Create new instance with DI
        return new SemanticModelService(developerLogService);
    }
}
