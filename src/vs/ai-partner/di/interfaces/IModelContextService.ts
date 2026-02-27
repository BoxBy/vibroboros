/**
 * Interface for Model Context Service
 * Manages model-specific context and settings
 */

export interface ModelContext {
    modelName: string;
    provider: string;
    maxTokens?: number;
    temperature?: number;
    contextWindow?: number;
    supportsStreaming?: boolean;
    [key: string]: any;
}

export interface IModelContextService {
    /**
     * Get the current model context
     */
    getContext(): ModelContext;

    /**
     * Update the model context
     */
    updateContext(context: Partial<ModelContext>): void;

    /**
     * Get context for a specific model
     */
    getContextForModel(modelName: string, provider: string): ModelContext;

    /**
     * Set the active model
     */
    setActiveModel(modelName: string, provider: string): void;
}
