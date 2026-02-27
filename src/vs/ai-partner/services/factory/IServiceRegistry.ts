/**
 * Service Registry Interface
 *
 * Defines the contract for service registration and retrieval.
 * Split from IServiceRegistrar for ISP compliance.
 */
export interface IServiceRegistry {
    /**
     * Get a registered service by key
     */
    get<T>(key: string): T | undefined;

    /**
     * Check if a service is registered
     */
    has(key: string): boolean;
}

/**
 * Service Registrar Interface
 *
 * Defines the contract for registering services.
 * Split from IServiceRegistry for ISP compliance.
 */
export interface IServiceRegistrar {
    /**
     * Register a service instance
     */
    register<T>(key: string, service: T): void;

    /**
     * Register a service factory
     */
    registerFactory(factory: import('./IServiceFactory').IServiceFactory): void;

    /**
     * Unregister a service
     */
    unregister(key: string): boolean;

    /**
     * Clear all services (for testing)
     */
    clear(): void;
}

/**
 * Combined registry interface for backward compatibility
 */
export interface IServiceRegistryWithRegistrar extends IServiceRegistry, IServiceRegistrar {}
