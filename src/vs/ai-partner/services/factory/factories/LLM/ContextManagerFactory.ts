/**
 * Context Manager Factory
 */

import { TypedServiceFactory } from '../../IServiceFactory';
import { ContextManager } from '../../../llm/ContextManager';

export class ContextManagerFactory extends TypedServiceFactory<ContextManager> {
    readonly key = 'IContextManager';
    readonly aliases = ['ContextManager'];

    create(): ContextManager {
        return ContextManager.getInstance();
    }
}
