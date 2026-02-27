/**
 * Embedding Service (Stub)
 * TODO: Implement actual embedding service
 */
export class EmbeddingService {
    private static instance: EmbeddingService;

    private constructor() {}

    public static getInstance(): EmbeddingService {
        if (!EmbeddingService.instance) {
            EmbeddingService.instance = new EmbeddingService();
        }
        return EmbeddingService.instance;
    }

    public static setInstance(instance: EmbeddingService): void {
        EmbeddingService.instance = instance;
    }

    // TODO: Implement embedding methods
    public async embed(text: string): Promise<number[]> {
        throw new Error('EmbeddingService not implemented');
    }
}
