/**
 * Service Factory Registry
 *
 * Manages service factories for lazy instantiation.
 * This allows extending available services without modifying the registry (OCP).
 */

import { IServiceFactory } from './IServiceFactory';

export class ServiceFactoryRegistry {
    private static instance: ServiceFactoryRegistry;
    private factories = new Map<string, IServiceFactory>();

    private constructor() {}

    public static getInstance(): ServiceFactoryRegistry {
        if (!ServiceFactoryRegistry.instance) {
            ServiceFactoryRegistry.instance = new ServiceFactoryRegistry();
        }
        return ServiceFactoryRegistry.instance;
    }

    /**
     * Register a service factory
     */
    public registerFactory(factory: IServiceFactory): void {
        // Register with primary key
        this.factories.set(factory.key, factory);

        // Register aliases
        if (factory.aliases) {
            for (const alias of factory.aliases) {
                this.factories.set(alias, factory);
            }
        }
    }

    /**
     * Check if a factory can create a service for the given key
     */
    public canCreate(key: string): boolean {
        const factory = this.factories.get(key);
        return factory ? factory.canCreate(key) : false;
    }

    /**
     * Create a service instance using the registered factory
     */
    public create(key: string): any | undefined {
        const factory = this.factories.get(key);
        return factory ? factory.create() : undefined;
    }

    /**
     * Check if the service is a singleton
     */
    public isSingleton(key: string): boolean {
        const factory = this.factories.get(key);
        return factory ? factory.isSingleton() : true;
    }

    /**
     * Get all registered factory keys
     */
    public getRegisteredKeys(): string[] {
        return Array.from(this.factories.keys());
    }

    /**
     * Clear all factories (for testing)
     */
    public clear(): void {
        this.factories.clear();
    }
}
