/**
 * LLM Service Factory
 */

import { TypedServiceFactory } from '../IServiceFactory';
import { LLMService } from '../../LLMService';
import type { ServiceContainer } from '../../../di/ServiceContainer';
import type { IConfigService } from '../../../di/interfaces/IConfigService';

export class LLMServiceFactory extends TypedServiceFactory<LLMService> {
    readonly key = 'ILLMService';
    readonly aliases = ['LLMService'];

    create(container?: ServiceContainer): LLMService {
        let configService: IConfigService | undefined;
        if (container && container.has('IConfigService')) {
            configService = container.resolve<IConfigService>('IConfigService');
        }
        return LLMService.getInstance(configService);
    }
}
