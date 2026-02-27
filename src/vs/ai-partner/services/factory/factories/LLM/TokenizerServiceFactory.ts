/**
 * Tokenizer Service Factory
 */

import { TypedServiceFactory } from '../../IServiceFactory';
import { TokenizerService } from '../../../llm/TokenizerService';

export class TokenizerServiceFactory extends TypedServiceFactory<TokenizerService> {
    readonly key = 'ITokenizerService';
    readonly aliases = ['TokenizerService'];

    create(): TokenizerService {
        return TokenizerService.getInstance();
    }
}
