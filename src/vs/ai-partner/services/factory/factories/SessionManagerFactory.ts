/**
 * Session Manager Service Factory
 */

import { TypedServiceFactory } from '../IServiceFactory';
import { SessionManager } from '../../SessionManager';

export class SessionManagerFactory extends TypedServiceFactory<SessionManager> {
    readonly key = 'ISessionManager';
    readonly aliases = ['SessionManager'];

    create(): SessionManager {
        return SessionManager.getInstance();
    }
}
