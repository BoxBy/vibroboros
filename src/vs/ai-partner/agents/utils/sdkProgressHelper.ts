import { ExecutionEventBus, RequestContext } from '@a2a-js/sdk/server';
import { v4 as uuidv4 } from 'uuid';

/**
 * SDK 표준 방식으로 progress log를 발행하는 헬퍼 함수
 * @param eventBus ExecutionEventBus
 * @param message Progress log 메시지
 * @param requestContext RequestContext (taskId와 contextId를 자동으로 추출)
 */
export function publishProgressLog(
    eventBus: ExecutionEventBus,
    message: string,
    requestContext: RequestContext
): void {
    const statusUpdate: any = {
        kind: 'status-update',
        taskId: requestContext.taskId,
        contextId: requestContext.contextId,
        final: false,
        status: {
            state: 'working',
            message: {
                kind: 'message',
                messageId: uuidv4(),
                role: 'agent',
                parts: [{
                    kind: 'text',
                    text: message
                }]
            },
            timestamp: new Date().toISOString()
        }
    };

    eventBus.publish(statusUpdate);
}

/**
 * SDK 표준 방식으로 완료 상태를 발행하는 헬퍼 함수
 */
export function publishProgressComplete(
    eventBus: ExecutionEventBus,
    message: string,
    requestContext: RequestContext
): void {
    const statusUpdate: any = {
        kind: 'status-update',
        taskId: requestContext.taskId,
        contextId: requestContext.contextId,
        final: true,
        status: {
            state: 'completed',
            message: {
                kind: 'message',
                messageId: uuidv4(),
                role: 'agent',
                parts: [{
                    kind: 'text',
                    text: message
                }]
            },
            timestamp: new Date().toISOString()
        }
    };

    eventBus.publish(statusUpdate);
}

/**
 * SDK 표준 방식으로 에러 상태를 발행하는 헬퍼 함수
 */
export function publishProgressError(
    eventBus: ExecutionEventBus,
    message: string,
    requestContext: RequestContext
): void {
    const statusUpdate: any = {
        kind: 'status-update',
        taskId: requestContext.taskId,
        contextId: requestContext.contextId,
        final: true,
        status: {
            state: 'failed',
            message: {
                kind: 'message',
                messageId: uuidv4(),
                role: 'agent',
                parts: [{
                    kind: 'text',
                    text: message
                }]
            },
            timestamp: new Date().toISOString()
        }
    };

    eventBus.publish(statusUpdate);
}
