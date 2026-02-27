/**
 * Logger Service Factory
 */

import { TypedServiceFactory } from '../IServiceFactory';
import { DeveloperLogService } from '../../DeveloperLogService';

export class LoggerServiceFactory extends TypedServiceFactory<DeveloperLogService> {
    readonly key = 'ILoggerService';
    readonly aliases = ['DeveloperLogService', 'LoggerService'];

    create(): DeveloperLogService {
        return DeveloperLogService.getInstance();
    }
}
