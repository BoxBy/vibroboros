import { TypedServiceFactory } from '../IServiceFactory';
import { SymbolicSearchService } from '../../SymbolicSearchService';

export class SymbolicSearchServiceFactory extends TypedServiceFactory<SymbolicSearchService> {
    public readonly key = 'SymbolicSearchService';

    public create(): SymbolicSearchService {
        return SymbolicSearchService.getInstance();
    }
}
