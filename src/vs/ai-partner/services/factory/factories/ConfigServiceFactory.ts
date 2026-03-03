/**
 * Config Service Factory
 */

import { TypedServiceFactory } from '../IServiceFactory';
import { ConfigService } from '../../../config_service';
import type { ServiceContainer } from '../../../di/ServiceContainer';

export class ConfigServiceFactory extends TypedServiceFactory<ConfigService> {
    readonly key = 'IConfigService';
    readonly aliases = ['ConfigService'];

    create(container?: ServiceContainer): ConfigService {
        if (container && container.getExtensionContext?.()) {
            const context = container.getExtensionContext();
            return new ConfigService(context);
        }
        throw new Error('ExtensionContext is required to create ConfigService');
    }
}
