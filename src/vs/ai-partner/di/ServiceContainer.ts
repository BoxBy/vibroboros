/**
 * Simple Service Container for Dependency Injection
 *
 * A lightweight DI container supporting:
 * - Singleton lifetime
 * - Transient lifetime
 * - Lazy resolution
 * - Extension context storage
 */

export enum ServiceLifetime {
    SINGLETON,
    TRANSIENT,
    SCOPED
}

type ServiceFactory<T> = (container: ServiceContainer) => T;

interface ServiceRegistration<T = any> {
    factory: ServiceFactory<T>;
    lifetime: ServiceLifetime;
    instance?: T;
}

/**
 * Service Container
 */
export class ServiceContainer {
    private services = new Map<string | symbol, ServiceRegistration>();
    private extensionContext: any;

    /**
     * Register a service with the container
     */
    public register<T>(
        identifier: string | symbol,
        factory: ServiceFactory<T>,
        lifetime: ServiceLifetime = ServiceLifetime.SINGLETON
    ): void {
        this.services.set(identifier, { factory, lifetime });
    }

    /**
     * Register a singleton instance directly
     */
    public registerSingleton<T>(identifier: string | symbol, instance: T): void {
        this.services.set(identifier, {
            factory: () => instance,
            lifetime: ServiceLifetime.SINGLETON,
            instance
        });
    }

    /**
     * Resolve a service from the container
     */
    public resolve<T>(identifier: string | symbol): T {
        const registration = this.services.get(identifier);

        if (!registration) {
            throw new Error(`Service '${String(identifier)}' is not registered`);
        }

        // Return existing instance for singletons
        if (registration.lifetime === ServiceLifetime.SINGLETON && registration.instance) {
            return registration.instance as T;
        }

        // Create new instance
        const instance = registration.factory(this);

        // Store instance for singletons
        if (registration.lifetime === ServiceLifetime.SINGLETON) {
            registration.instance = instance;
        }

        return instance;
    }

    /**
     * Check if a service is registered
     */
    public has(identifier: string | symbol): boolean {
        return this.services.has(identifier);
    }

    /**
     * Get the extension context
     */
    public getExtensionContext?(): any {
        return this.extensionContext;
    }

    /**
     * Set the extension context
     */
    public setExtensionContext(context: any): void {
        this.extensionContext = context;
    }

    /**
     * Clear all registrations
     */
    public clear(): void {
        this.services.clear();
    }
}

/**
 * Global service container instance
 */
export const serviceContainer = new ServiceContainer();

/**
 * Decorator for marking classes as injectable
 */
export function injectable<T extends new (...args: any[]) => any>(constructor: T) {
    return constructor;
}

/**
 * Decorator for injecting dependencies
 */
export function inject(identifier: string | symbol) {
    return function (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) {
        // Metadata storage would go here
        console.log(`[inject] Registered injection for ${String(identifier)} at index ${parameterIndex}`);
    };
}

/**
 * Interface for ServiceContainer
 */
export interface IServiceContainer {
    register<T>(identifier: string | symbol, factory: ServiceFactory<T>, lifetime?: ServiceLifetime): void;
    resolve<T>(identifier: string | symbol): T;
    has(identifier: string | symbol): boolean;
    clear(): void;
}
