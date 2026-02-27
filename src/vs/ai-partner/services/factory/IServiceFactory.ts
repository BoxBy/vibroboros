/**
 * Service Factory Interface
 *
 * Defines the contract for creating service instances.
 * This enables the ServiceRegistry to be extended without modification (OCP).
 */
export interface IServiceFactory {
    /**
     * The unique key/identifier for this factory
     */
    readonly key: string;

    /**
     * The aliases for this factory (alternative keys)
     */
    readonly aliases?: string[];

    /**
     * Check if this factory can create a service for the given key
     */
    canCreate(key: string): boolean;

    /**
     * Create a new instance of the service
     */
    create(): any;

    /**
     * Check if the created service is a singleton
     * If true, the registry will cache the instance
     */
    isSingleton(): boolean;
}

/**
 * Generic typed service factory for better type safety
 */
export abstract class TypedServiceFactory<T> implements IServiceFactory {
    abstract readonly key: string;
    readonly aliases?: string[] = [];

    abstract create(): T;

    canCreate(key: string): boolean {
        return key === this.key || (this.aliases?.includes(key) ?? false);
    }

    isSingleton(): boolean {
        return true; // Default to singleton
    }
}
