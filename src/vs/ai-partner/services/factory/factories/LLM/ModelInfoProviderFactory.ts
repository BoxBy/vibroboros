/**
 * Model Info Provider Factory
 */

import { TypedServiceFactory } from '../../IServiceFactory';
import { ModelInfoProvider } from '../../../llm/ModelInfoProvider';

export class ModelInfoProviderFactory extends TypedServiceFactory<ModelInfoProvider> {
    readonly key = 'IModelInfoProvider';
    readonly aliases = ['ModelInfoProvider'];

    create(): ModelInfoProvider {
        return ModelInfoProvider.getInstance();
    }
}
