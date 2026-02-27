/**
 * Request Handler Factory
 */

import { TypedServiceFactory } from '../../IServiceFactory';
import { RequestHandler } from '../../../llm/RequestHandler';

export class RequestHandlerFactory extends TypedServiceFactory<RequestHandler> {
    readonly key = 'IRequestHandler';
    readonly aliases = ['RequestHandler'];

    create(): RequestHandler {
        return RequestHandler.getInstance();
    }
}
