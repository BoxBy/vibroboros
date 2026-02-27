/**
 * Domain Events
 * Simple event bus for domain events
 */

type EventHandler = (event: any) => void;

class EventBus {
    private handlers = new Map<string, EventHandler[]>();

    on(eventType: string, handler: EventHandler): void {
        const handlers = this.handlers.get(eventType) || [];
        handlers.push(handler);
        this.handlers.set(eventType, handlers);
    }

    off(eventType: string, handler: EventHandler): void {
        const handlers = this.handlers.get(eventType);
        if (handlers) {
            const idx = handlers.indexOf(handler);
            if (idx >= 0) {
                handlers.splice(idx, 1);
            }
        }
    }

    emit(eventType: string, event: any): void {
        const handlers = this.handlers.get(eventType);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(event);
                } catch (e) {
                    console.error(`Event handler error for ${eventType}:`, e);
                }
            }
        }
    }
}

export const eventBus = new EventBus();
