/**
 * Service Registry
 *
 * 중앙 서비스 레지스트리로 의존성 주입을 지원합니다.
 * - Singleton 직접 호출 제거
 * - 테스트 가능성 향상
 * - 인터페이스 기반 의존성
 * - Factory 패턴으로 OCP 준수
 *
 * 사용법:
 *   const registry = ServiceRegistry.getInstance();
 *   registry.register<ILLMService>('LLMService', new LLMService());
 *   const llm = registry.get<ILLMService>('LLMService');
 */

import { LLMService } from './LLMService';
import { ConfigService } from '../config_service';
import { DeveloperLogService } from './DeveloperLogService';

import { SessionManager } from './SessionManager';
import { EmbeddingService } from './EmbeddingService';
import { RerankerService } from './RerankerService';

// Import refactored LLM services
import { TokenizerService, ModelInfoProvider, ContextManager, RequestHandler } from './llm';

// Import factory pattern for OCP compliance
import { ServiceFactoryRegistry, IServiceFactory, IServiceRegistry, IServiceRegistrar } from './factory';
import {
    LLMServiceFactory,
    ConfigServiceFactory,
    LoggerServiceFactory,
    SessionManagerFactory,
    EmbeddingServiceFactory,
    RerankerServiceFactory,
    TokenizerServiceFactory,
    ModelInfoProviderFactory,
    ContextManagerFactory,
    RequestHandlerFactory
} from './factory/factories';

// ============================================================================
// Service Interfaces
// ============================================================================

export interface ILLMService {
    callLLM(params: any): Promise<any>;
    getModelInfo(modelName: string): Promise<any>;
    countTokens(text: string, model?: string): Promise<number>;
}

export interface IConfigService {
    getActiveProfile(): string;
    getPrompt(agentName: string): Promise<string>;
    getModel(): string;
    getEmbeddingProvider(): string;
    getEmbeddingApiKey(): Promise<string>;
}

export interface ILoggerService {
    log(message: string): void;
    error(message: string, error?: Error): void;
    warn(message: string): void;
}



export interface ISessionManager {
    createSession(id: string): any;
    getSession(id: string): any;
    addMessage(sessionId: string, message: any): void;
}

export interface IEmbeddingService {
    embed(text: string | string[], options?: any): Promise<number[][]>;
    getDimension(model?: string): number;
}

export interface IRerankerService {
    rerank(params: any): Promise<any>;
}

export interface ITokenizerService {
    countTokens(content: string | any[], modelId?: string): number;
}

export interface IModelInfoProvider {
    getModelInfo(provider: any, model: string, apiKey?: string, endpoint?: string): Promise<any>;
    listModels(provider: any, apiKey: string, endpoint: string): Promise<string[]>;
}

export interface IContextManager {
    truncateContext(provider: any, modelId: string, messages: any[], systemPrompt?: string, safetyBuffer?: number): Promise<any[]>;
    resolveReasoningParameters(modelInfo: any, effort: any): any | null;
}

export interface IRequestHandler {
    requestCompletion(params: any): Promise<any>;
    getUsageTotals(): any;
    resetUsageTotals(): void;
}

// ============================================================================
// Service Registry
// ============================================================================

export class ServiceRegistry implements IServiceRegistry, IServiceRegistrar {
    private static instance: ServiceRegistry;
    private services = new Map<string, any>();
    private factoryRegistry: ServiceFactoryRegistry;

    private constructor() {
        this.factoryRegistry = ServiceFactoryRegistry.getInstance();
        this.registerDefaultFactories();
    }

    public static getInstance(): ServiceRegistry {
        if (!ServiceRegistry.instance) {
            ServiceRegistry.instance = new ServiceRegistry();
        }
        return ServiceRegistry.instance;
    }

    /**
     * 기본 서비스 팩토리들을 등록합니다 (OCP 준수)
     */
    private registerDefaultFactories(): void {
        try {
            const factories: IServiceFactory[] = [
                new LLMServiceFactory(),
                new ConfigServiceFactory(),
                new LoggerServiceFactory(),
                new SessionManagerFactory(),
                new EmbeddingServiceFactory(),
                new RerankerServiceFactory(),
                new TokenizerServiceFactory(),
                new ModelInfoProviderFactory(),
                new ContextManagerFactory(),
                new RequestHandlerFactory()
            ];

            for (const factory of factories) {
                this.factoryRegistry.registerFactory(factory);
            }

            console.log('[ServiceRegistry] Initialized with factory pattern (OCP compliant)');
        } catch (e) {
            console.warn('[ServiceRegistry] Failed to initialize default factories:', e);
        }
    }

    /**
     * 서비스를 레지스트리에 등록합니다
     */
    public register<T>(key: string, service: T): void {
        if (this.services.has(key)) {
            console.warn(`[ServiceRegistry] Service '${key}' is already registered. Overwriting.`);
        }
        this.services.set(key, service);
        console.log(`[ServiceRegistry] Registered: ${key}`);
    }

    /**
     * 서비스 팩토리를 등록합니다 (OCP 준수)
     */
    public registerFactory(factory: IServiceFactory): void {
        this.factoryRegistry.registerFactory(factory);
        console.log(`[ServiceRegistry] Registered factory: ${factory.key}`);
    }

    /**
     * 등록된 서비스를 가져옵니다
     */
    public get<T>(key: string): T | undefined {
        // 1. 이미 인스턴스화된 서비스가 있으면 반환
        const service = this.services.get(key);
        if (service) {
            return service;
        }

        // 2. 팩토리를 통해 인스턴스 생성 (lazy loading)
        if (this.factoryRegistry.canCreate(key)) {
            const instance = this.factoryRegistry.create(key);
            if (instance) {
                // 싱글톤이면 캐시
                if (this.factoryRegistry.isSingleton(key)) {
                    this.services.set(key, instance);
                }
                return instance;
            }
        }

        console.warn(`[ServiceRegistry] Service not found: ${key}`);
        return undefined;
    }

    /**
     * 서비스가 등록되어 있는지 확인합니다
     */
    public has(key: string): boolean {
        return this.services.has(key) || this.factoryRegistry.canCreate(key);
    }

    /**
     * 서비스를 레지스트리에서 제거합니다
     */
    public unregister(key: string): boolean {
        return this.services.delete(key);
    }

    /**
     * 모든 서비스를 초기화합니다 (테스트용)
     */
    public clear(): void {
        this.services.clear();
        console.log('[ServiceRegistry] All services cleared');
    }

    /**
     * 모든 등록된 서비스 키를 반환합니다
     */
    public getRegisteredKeys(): string[] {
        return Array.from(this.services.keys());
    }
}

// ============================================================================
// Helper Functions (간편 함수)
// ============================================================================

export const registry = ServiceRegistry.getInstance();

export function getService<T>(key: string): T | undefined {
    return registry.get<T>(key);
}

export function registerService<T>(key: string, service: T): void {
    registry.register(key, service);
}

export function registerServiceFactory(factory: IServiceFactory): void {
    registry.registerFactory(factory);
}
